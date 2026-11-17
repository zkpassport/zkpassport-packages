//! Query-driven disclosure selection.
//!
//! Maps a verifier Query (the SDK's JSON from the QR `c` param) to the set of
//! disclosure circuits to prove, mirroring the app's `getDisclosureCircuits`.
//! For each: the circuit name (with `_evm` when requested), the circuit inputs,
//! and the `committedInputs` the verifier's public-input checker recomputes.
//! OPRF/facematch/sanctions are out of scope.

use crate::disclosure::*;
use crate::commitments::IntegrityToDisclosureSalts;
use num_bigint::BigUint;
use serde_json::{json, Value};

pub struct DisclosureResult {
    pub name: String,
    pub inputs: Value,
    pub committed_inputs: Value,
    /// For disclose_bytes: the parsed disclosed values (firstname, etc.),
    /// computed the same way the verifier does — so the QueryResult matches.
    pub disclosed: Option<Value>,
}

fn suffix(evm: bool) -> &'static str {
    if evm {
        "_evm"
    } else {
        ""
    }
}

/// True if a query field/operator is present and truthy.
fn has(query: &Value, field: &str, op: &str) -> bool {
    query
        .get(field)
        .and_then(|f| f.get(op))
        .map(|v| !v.is_null())
        .unwrap_or(false)
}

fn u32_at(query: &Value, field: &str, op: &str) -> Option<u32> {
    query.get(field)?.get(op)?.as_u64().map(|n| n as u32)
}

/// A date operator value is milliseconds (JS Date.getTime) — to unix seconds.
fn date_secs(query: &Value, field: &str, op: &str) -> Option<i64> {
    date_value_secs(query.get(field)?.get(op)?)
}

/// A query date in unix seconds. The SDK sends a `Date` as JSON does (an ISO string) and a
/// number as milliseconds.
fn date_value_secs(v: &Value) -> Option<i64> {
    if let Some(ms) = v.as_i64() {
        return Some(ms / 1000);
    }
    let s = v.as_str()?;
    let num = |range: std::ops::Range<usize>| -> Option<i64> { s.get(range)?.parse().ok() };
    let days = days_from_civil(num(0..4)?, num(5..7)?, num(8..10)?);
    Some(days * 86400 + num(11..13).unwrap_or(0) * 3600 + num(14..16).unwrap_or(0) * 60 + num(17..19).unwrap_or(0))
}

fn str_list(query: &Value, field: &str, op: &str) -> Vec<String> {
    query
        .get(field)
        .and_then(|f| f.get(op))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|s| s.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// disclosedBytes for the disclose committedInputs: dg1[5..] * mask (aligned).
fn disclosed_bytes(dg1_padded: &[u8], mask: &[u8]) -> Vec<u8> {
    dg1_padded
        .iter()
        .skip(5)
        .zip(mask.iter())
        .map(|(b, m)| b * m)
        .collect()
}

/// Build every disclosure circuit the query asks for.
#[allow(clippy::too_many_arguments)]
pub fn build_disclosures(
    query: &Value,
    input: &DisclosureInput,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date: u64,
    evm: bool,
    dg1_padded: &[u8],
) -> Result<Vec<DisclosureResult>, String> {
    let mut out = Vec::new();
    let z = nullifier_secret;
    let (ss, sub) = (service_scope, service_subscope);
    let sfx = suffix(evm);

    // Disclose (disclosable fields with `disclose` or `eq`)
    let disclose_fields = DiscloseFields {
        firstname: has(query, "firstname", "disclose"),
        lastname: has(query, "lastname", "disclose"),
        fullname: has(query, "fullname", "disclose"),
        birthdate: has(query, "birthdate", "disclose"),
        document_number: has(query, "document_number", "disclose"),
        nationality: has(query, "nationality", "disclose"),
        document_type: has(query, "document_type", "disclose"),
        expiry_date: has(query, "expiry_date", "disclose"),
        gender: has(query, "gender", "disclose"),
        issuing_country: has(query, "issuing_country", "disclose"),
    };
    let any_disclose = [
        disclose_fields.firstname, disclose_fields.lastname, disclose_fields.fullname,
        disclose_fields.birthdate, disclose_fields.document_number, disclose_fields.nationality,
        disclose_fields.document_type, disclose_fields.expiry_date, disclose_fields.gender,
        disclose_fields.issuing_country,
    ]
    .iter()
    .any(|b| *b);
    if any_disclose {
        let inputs = get_disclose_circuit_inputs(input, &disclose_fields, salts, z, ss, sub, current_date, None)?;
        let mask = disclose_mask(input.mrz, &disclose_fields);
        let committed = json!({
            "disclosedBytes": disclosed_bytes(dg1_padded, &mask),
            "discloseMask": mask,
        });
        out.push(DisclosureResult { name: format!("disclose_bytes{sfx}"), inputs, committed_inputs: committed,
            disclosed: Some(crate::disclosure::disclosed_values(&disclosed_bytes(dg1_padded, &mask))) });
    }

    // Age
    let age_q = AgeQuery {
        gt: u32_at(query, "age", "gt"),
        gte: u32_at(query, "age", "gte"),
        lt: u32_at(query, "age", "lt"),
        lte: u32_at(query, "age", "lte"),
        eq: u32_at(query, "age", "eq"),
        range: query.get("age").and_then(|a| a.get("range")).and_then(|r| r.as_array()).and_then(|r| {
            Some((r.first()?.as_u64()? as u32, r.get(1)?.as_u64()? as u32))
        }),
        disclose_age: None,
    };
    if query.get("age").map(|a| a.is_object() && !a.as_object().unwrap().is_empty()).unwrap_or(false) {
        let inputs = get_age_circuit_inputs(input, &age_q, salts, z, ss, sub, current_date, None)?;
        let committed = json!({
            "minAge": inputs["min_age_required"], "maxAge": inputs["max_age_required"],
        });
        out.push(DisclosureResult { name: format!("compare_age{sfx}"), inputs, committed_inputs: committed, disclosed: None });
    }

    // Date comparisons (birthdate / expiry)
    for (field, is_birth, circuit) in [("birthdate", true, "compare_birthdate"), ("expiry_date", false, "compare_expiry")] {
        let bounds = resolve_date_bounds(query, field);
        if let Some(bounds) = bounds {
            let inputs = get_date_circuit_inputs(input, &bounds, is_birth, salts, z, ss, sub, current_date, None)?;
            let committed = json!({
                "minDateTimestamp": inputs["min_date"], "maxDateTimestamp": inputs["max_date"],
            });
            out.push(DisclosureResult { name: format!("{circuit}{sfx}"), inputs, committed_inputs: committed, disclosed: None });
        }
    }

    // Country inclusion / exclusion
    for (field, circuit) in [("nationality", "nationality"), ("issuing_country", "issuing_country")] {
        let inc = str_list(query, field, "in");
        if !inc.is_empty() {
            let inputs = get_country_inclusion_circuit_inputs(input, &inc, salts, z, ss, sub, current_date, None)?;
            let committed = json!({ "countries": inc });
            out.push(DisclosureResult { name: format!("inclusion_check_{circuit}{sfx}"), inputs, committed_inputs: committed, disclosed: None });
        }
        let exc = str_list(query, field, "out");
        if !exc.is_empty() {
            let inputs = get_country_exclusion_circuit_inputs(input, &exc, salts, z, ss, sub, current_date, None)?;
            // committedInputs decodes the weighted-sum list; equals the sorted input set.
            let mut sorted = exc.clone();
            sorted.sort_by_key(|c| country_weighted_sum(c));
            let committed = json!({ "countries": sorted });
            out.push(DisclosureResult { name: format!("exclusion_check_{circuit}{sfx}"), inputs, committed_inputs: committed, disclosed: None });
        }
    }

    // Bind
    if let Some(bind) = query.get("bind").filter(|b| b.is_object()) {
        let bound = BoundData {
            user_address: bind.get("user_address").and_then(|v| v.as_str()).map(String::from),
            chain: bind.get("chain").and_then(|v| v.as_str()).map(String::from),
            custom_data: bind.get("custom_data").and_then(|v| v.as_str()).map(String::from),
        };
        let inputs = get_bind_circuit_inputs(input, &bound, salts, z, ss, sub, current_date, None)?;
        let committed = json!({ "data": bind.clone() });
        out.push(DisclosureResult { name: format!("bind{sfx}"), inputs, committed_inputs: committed, disclosed: None });
    }

    // Fallback: nothing requested → prove valid ID (disclose nothing).
    if out.is_empty() {
        let empty = DiscloseFields::default();
        let inputs = get_disclose_circuit_inputs(input, &empty, salts, z, ss, sub, current_date, None)?;
        let mask = disclose_mask(input.mrz, &empty);
        let committed = json!({
            "disclosedBytes": disclosed_bytes(dg1_padded, &mask), "discloseMask": mask,
        });
        out.push(DisclosureResult { name: format!("disclose_bytes{sfx}"), inputs, committed_inputs: committed,
            disclosed: Some(crate::disclosure::disclosed_values(&disclosed_bytes(dg1_padded, &mask))) });
    }

    Ok(out)
}

/// Build the QueryResult the verifier expects in the `done` message, from the
/// query + the disclosed values (computed by `disclosed_values`). Each operator
/// becomes `{field: {op: {expected, result:true}}}`; `disclose` (and `eq` on a
/// disclosable field) becomes `{field: {disclose: {result: <value>}}}`.
/// This is the single source of truth for the QueryResult across platforms.
pub fn build_query_result(query: &Value, disclosed: &Value, current_date: u64) -> Value {
    let mut result = serde_json::Map::new();
    let Some(obj) = query.as_object() else {
        return Value::Object(result);
    };
    for (field, cfg) in obj {
        if field == "bind" {
            result.insert("bind".into(), cfg.clone());
            continue;
        }
        let Some(cfg) = cfg.as_object() else { continue };
        if field == "sanctions" {
            result.insert("sanctions".into(), sanctions_result(cfg));
            continue;
        }
        if field == "facematch" {
            result.insert("facematch".into(), facematch_result(cfg));
            continue;
        }
        let comparison_field = field == "age" || field == "birthdate" || field == "expiry_date";
        let mut field_result = serde_json::Map::new();
        for (op, value) in cfg {
            if op == "disclose" || (op == "eq" && !comparison_field) {
                let mut v = disclosed.get(field).cloned().unwrap_or(Value::Null);
                // The SDK reads a disclosed date as a date, so send it as one, not as the MRZ's YYMMDD
                if field == "birthdate" || field == "expiry_date" {
                    v = v.as_str().and_then(|s| mrz_date_iso(s, current_date)).map_or(Value::Null, Value::from);
                }
                field_result.insert("disclose".into(), json!({ "result": v }));
            } else {
                field_result.insert(op.clone(), json!({ "expected": value, "result": true }));
            }
        }
        if !field_result.is_empty() {
            result.insert(field.clone(), Value::Object(field_result));
        }
    }
    Value::Object(result)
}

/// The sanctions entry in the form the SDK reads. A result is only sent
/// after the sanctions proof was made, so the check passed.
fn sanctions_result(config: &serde_json::Map<String, Value>) -> Value {
    json!({
        "passed": true,
        "isStrict": config.get("strict").and_then(Value::as_bool).unwrap_or(false),
    })
}

/// The face match entry in the form the SDK reads. A result is only sent
/// after the face match proof was made, so the check passed.
fn facematch_result(config: &serde_json::Map<String, Value>) -> Value {
    json!({ "mode": config.get("mode"), "passed": true })
}

/// Resolve a date field's min/max bounds (gt/gte/lt/lte/range/eq), applying
/// the ±1 day for exclusive gt/lt. Returns None when the query compares nothing: a bare
/// `disclose` is proven by the disclose proof alone, as in the app.
fn resolve_date_bounds(query: &Value, field: &str) -> Option<DateBounds> {
    let f = query.get(field)?;
    if !f.is_object() || f.as_object()?.is_empty() {
        return None;
    }
    const DAY: i64 = 86400;
    let mut min = None;
    let mut max = None;
    if let Some(gt) = date_secs(query, field, "gt") {
        min = Some(gt + DAY);
    } else if let Some(gte) = date_secs(query, field, "gte") {
        min = Some(gte);
    } else if let Some(r) = f.get("range").and_then(|r| r.as_array()) {
        min = r.first().and_then(date_value_secs);
        max = r.get(1).and_then(date_value_secs);
    } else if let Some(eq) = date_secs(query, field, "eq") {
        min = Some(eq);
        max = Some(eq);
    }
    if let Some(lt) = date_secs(query, field, "lt") {
        max = Some(lt - DAY);
    } else if let Some(lte) = date_secs(query, field, "lte") {
        max = Some(lte);
    }
    if min.is_none() && max.is_none() {
        return None;
    }
    Some(DateBounds { min, max })
}

/// Days since 1970-01-01 for a proleptic-Gregorian UTC civil date (Howard Hinnant).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

/// Year, month and day of a count of days since 1970-01-01 (Howard Hinnant).
fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    (if month <= 2 { yoe + era * 400 + 1 } else { yoe + era * 400 }, month, day)
}

/// Year of a unix timestamp (for parseDate's current-year century rule).
fn year_of_unix(secs: i64) -> i64 {
    civil_from_days(secs.div_euclid(86400)).0
}

/// `parseDate(YYMMDD).toISOString()`: the disclosed date as the SDK reads it.
fn mrz_date_iso(yymmdd: &str, current_date: u64) -> Option<String> {
    let (year, month, day) = civil_from_days(parse_mrz_date(yymmdd, current_date)? / 86400);
    Some(format!("{year:04}-{month:02}-{day:02}T00:00:00.000Z"))
}

/// `parseDate(YYMMDD)` + `getUnixTimestamp`: 2-digit year → current century unless that
/// lands >10 years in the future (then previous century); UTC midnight → unix secs.
fn parse_mrz_date(yymmdd: &str, current_date: u64) -> Option<i64> {
    let s: &str = yymmdd.trim_end_matches('\0');
    if s.len() < 6 {
        return None;
    }
    let year: i64 = s.get(0..2)?.parse().ok()?;
    let month: i64 = s.get(2..4)?.parse().ok()?;
    let day: i64 = s.get(4..6)?.parse().ok()?;
    let current_year = year_of_unix(current_date as i64);
    let current_century = (current_year / 100) * 100;
    let full_year = year
        + if year + current_century > current_year + 10 { current_century - 100 } else { current_century };
    Some(days_from_civil(full_year, month, day) * 86400)
}

#[cfg(test)]
mod date_disclose_tests {
    use super::*;
    #[test]
    fn parse_mrz_date_dob() {
        // 1990-01-01 UTC = 631152000; "900101" with a 2026-ish now → 1990 (century rule).
        let now = 1_760_000_000; // ~Oct 2025
        assert_eq!(parse_mrz_date("900101", now), Some(631_152_000));
        // "000229" (2000-02-29, a leap day) = 951_782_400.
        assert_eq!(parse_mrz_date("000229", now), Some(951_782_400));
    }
}

#[cfg(test)]
mod query_result_tests {
    use super::*;

    #[test]
    fn sanctions_result_has_the_form_the_sdk_reads() {
        let result = build_query_result(&json!({ "sanctions": { "strict": true } }), &json!({}), 0);

        assert_eq!(result["sanctions"]["passed"], true);
        assert_eq!(result["sanctions"]["isStrict"], true);
    }

    #[test]
    fn facematch_result_has_the_form_the_sdk_reads() {
        let result = build_query_result(&json!({ "facematch": { "mode": "strict" } }), &json!({}), 0);

        assert_eq!(result["facematch"], json!({ "mode": "strict", "passed": true }));
    }

    #[test]
    fn a_disclosed_date_gets_no_comparison_proof() {
        let query = json!({ "birthdate": { "disclose": true }, "expiry_date": { "disclose": true, "gte": 1_767_225_600_000u64 } });

        assert!(resolve_date_bounds(&query, "birthdate").is_none());
        assert!(resolve_date_bounds(&query, "expiry_date").is_some());
    }

    #[test]
    fn a_date_comparison_is_read_as_the_sdk_sends_it() {
        let query = json!({ "expiry_date": { "gte": "2026-11-16T00:00:00.000Z" } });

        let bounds = resolve_date_bounds(&query, "expiry_date").expect("bounds");

        assert_eq!(bounds.min, Some(1_794_787_200));
        assert_eq!(bounds.max, None);
    }

    #[test]
    fn disclosed_dates_are_sent_as_dates() {
        let query = json!({ "birthdate": { "disclose": true }, "expiry_date": { "disclose": true } });
        let disclosed = json!({ "birthdate": "900101", "expiry_date": "350101" });
        let now = 1_760_000_000; // ~Oct 2025

        let result = build_query_result(&query, &disclosed, now);

        assert_eq!(result["birthdate"]["disclose"]["result"], "1990-01-01T00:00:00.000Z");
        assert_eq!(result["expiry_date"]["disclose"]["result"], "2035-01-01T00:00:00.000Z");
    }
}
