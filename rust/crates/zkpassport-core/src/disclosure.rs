//! Disclosure-proof input builders (everything except facematch/OPRF).
//!
//! Ports of the `get*CircuitInputs` builders in `@zkpassport/utils`
//! `src/circuit-matcher.ts`: age, disclose_bytes, compare_birthdate,
//! compare_expiry, nationality/issuing-country inclusion & exclusion, bind.
//! All share the disclosure prologue (private nullifier + comm_in + the five
//! salted values) and the common tail (scopes / nullifier_secret / oprf_proof).
//! OPRF is out of scope: `nullifier_secret` = 0 with the zero proof.

use crate::bytes::{pack_be_bytes_into_field_elems, right_pad_with_zeros};
use crate::commitments::{
    calculate_private_nullifier, hash_salt_dg1_dg2_hash_private_nullifier, normalize_dg2_hash,
    IntegrityToDisclosureSalts,
};
use crate::integrity::{DG1_INPUT_SIZE, E_CONTENT_INPUT_SIZE};
use num_bigint::BigUint;
use serde_json::{json, Value};

/// Seconds between 1900-01-01 and the Unix epoch (birthdate circuit offset).
pub const SECONDS_1900_TO_1970: i64 = 2_208_988_800;

pub fn hash_algorithm_id_from_length(length: usize) -> Result<u32, String> {
    match length {
        20 => Ok(1),
        28 => Ok(2),
        32 => Ok(3),
        48 => Ok(4),
        64 => Ok(5),
        _ => Err(format!("Unsupported hash algorithm length: {length}")),
    }
}

pub fn oprf_zero_proof() -> Value {
    json!({
        "pk": { "x": "0x0", "y": "0x0" },
        "dlog_e": "0x0",
        "dlog_s": "0x0",
        "response_blinded": { "x": "0x0", "y": "0x0" },
        "response": { "x": "0x0", "y": "0x0" },
        "beta": "0x0",
    })
}

fn hex_min(x: &BigUint) -> String {
    format!("0x{x:x}")
}

fn hex_even(x: &BigUint) -> String {
    let hex = format!("{x:x}");
    format!("0x{}{hex}", if hex.len() % 2 == 1 { "0" } else { "" })
}

/// Raw passport fields shared by the disclosure builders.
pub struct DisclosureInput<'a> {
    pub dg1: &'a [u8],
    pub e_content: &'a [u8],
    /// SOD signerInfo signature, already ECDSA-normalized (RSA passes through).
    pub sod_signature_processed: &'a [u8],
    /// DG2 hash bytes as read from the SOD (length determines the hash type).
    pub dg2_hash: &'a [u8],
    /// Passport expiry as the 6-char MRZ string (e.g. "350101").
    pub expiry_date: &'a str,
    /// The MRZ string (from DG1), for disclose-mask ranges.
    pub mrz: &'a str,
}

/// The disclosure prologue, computed once and shared by every builder in a run.
pub struct DisclosureBase {
    dg1_padded: Vec<u8>,
    dg2_hash_normalized: BigUint,
    dg2_hash_type: u32,
    private_nullifier: BigUint,
    comm_in: BigUint,
}

impl DisclosureBase {
    pub fn compute(
        input: &DisclosureInput,
        salts: &IntegrityToDisclosureSalts,
    ) -> Result<Self, String> {
        let dg1_padded = right_pad_with_zeros(input.dg1, DG1_INPUT_SIZE);
        let e_content_padded = right_pad_with_zeros(input.e_content, E_CONTENT_INPUT_SIZE);
        let dg2_hash_normalized = normalize_dg2_hash(input.dg2_hash);
        let dg2_hash_type = hash_algorithm_id_from_length(input.dg2_hash.len())?;
        let private_nullifier = calculate_private_nullifier(
            &dg1_padded,
            &e_content_padded,
            input.sod_signature_processed,
        );
        let comm_in = hash_salt_dg1_dg2_hash_private_nullifier(
            salts,
            &dg1_padded,
            input.expiry_date,
            &dg2_hash_normalized,
            dg2_hash_type,
            &private_nullifier,
        );
        Ok(Self {
            dg1_padded,
            dg2_hash_normalized,
            dg2_hash_type,
            private_nullifier,
            comm_in,
        })
    }
}

/// `getSaltedValuesForDisclosureCircuit` + the common tail, as a JSON object
/// the specific fields are then inserted into.
#[allow(clippy::too_many_arguments)]
fn base_object(
    base: &DisclosureBase,
    input: &DisclosureInput,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: &Option<Value>,
) -> Value {
    let salted = |value: Value, salt: &BigUint| {
        json!({ "value": value, "salt": hex_min(salt), "hash": "0x0" })
    };
    json!({
        "salted_dg1": salted(json!(base.dg1_padded), &salts.dg1_salt),
        "salted_private_nullifier": salted(json!(hex_min(&base.private_nullifier)), &salts.private_nullifier_salt),
        "salted_expiry_date": salted(json!(input.expiry_date.as_bytes()), &salts.expiry_date_salt),
        "salted_dg2_hash": salted(json!(hex_min(&base.dg2_hash_normalized)), &salts.dg2_hash_salt),
        "salted_dg2_hash_type": salted(json!(hex_min(&BigUint::from(base.dg2_hash_type))), &salts.dg2_hash_salt),
        "current_date": current_date_timestamp,
        "comm_in": hex_even(&base.comm_in),
        "service_scope": hex_min(service_scope),
        "service_subscope": hex_min(service_subscope),
        "nullifier_secret": hex_min(nullifier_secret),
        "oprf_proof": oprf_proof.clone().unwrap_or_else(oprf_zero_proof),
    })
}

fn insert(obj: &mut Value, key: &str, val: Value) {
    if let Value::Object(m) = obj {
        m.insert(key.into(), val);
    }
}

// ---- Age ------------------------------------------------------------------

#[derive(Default, Clone)]
pub struct AgeQuery {
    pub gt: Option<u32>,
    pub gte: Option<u32>,
    pub lt: Option<u32>,
    pub lte: Option<u32>,
    pub range: Option<(u32, u32)>,
    pub eq: Option<u32>,
    pub disclose_age: Option<u32>,
}

impl AgeQuery {
    fn bounds(&self) -> (u32, u32) {
        let (mut min_age, mut max_age) = (0, 0);
        if let Some(gt) = self.gt {
            min_age = gt + 1;
        } else if let Some(gte) = self.gte {
            min_age = gte;
        } else if let Some((lo, hi)) = self.range {
            min_age = lo;
            max_age = hi;
        } else if let Some(eq) = self.eq {
            min_age = eq;
            max_age = eq;
        } else if let Some(age) = self.disclose_age {
            min_age = age;
            max_age = age;
        }
        if let Some(lt) = self.lt {
            max_age = lt - 1;
        } else if let Some(lte) = self.lte {
            max_age = lte;
        }
        (min_age, max_age)
    }
}

#[allow(clippy::too_many_arguments)]
pub fn get_age_circuit_inputs(
    input: &DisclosureInput,
    query: &AgeQuery,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: Option<Value>,
) -> Result<Value, String> {
    let base = DisclosureBase::compute(input, salts)?;
    let mut obj = base_object(
        &base, input, salts, nullifier_secret, service_scope, service_subscope,
        current_date_timestamp, &oprf_proof,
    );
    let (min_age, max_age) = query.bounds();
    insert(&mut obj, "min_age_required", json!(min_age));
    insert(&mut obj, "max_age_required", json!(max_age));
    Ok(obj)
}

// ---- Date comparison (birthdate / expiry) ---------------------------------

/// Resolved date bounds in unix seconds (the caller applies gt/lt ±1 day and
/// disclose resolution). `None` = the circuit's "ignore" sentinel (0).
#[derive(Default, Clone)]
pub struct DateBounds {
    pub min: Option<i64>,
    pub max: Option<i64>,
}

/// `getUnixTimestamp`: floor(seconds); 0 maps to 1 (0 is the ignore sentinel).
fn unix_ts(seconds: i64) -> i64 {
    if seconds == 0 {
        1
    } else {
        seconds
    }
}

/// compare_birthdate (offset +SECONDS_1900_TO_1970) / compare_expiry (no offset).
#[allow(clippy::too_many_arguments)]
pub fn get_date_circuit_inputs(
    input: &DisclosureInput,
    bounds: &DateBounds,
    is_birthdate: bool,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: Option<Value>,
) -> Result<Value, String> {
    let base = DisclosureBase::compute(input, salts)?;
    let mut obj = base_object(
        &base, input, salts, nullifier_secret, service_scope, service_subscope,
        current_date_timestamp, &oprf_proof,
    );
    let offset = if is_birthdate { SECONDS_1900_TO_1970 } else { 0 };
    let field = |b: Option<i64>| -> i64 {
        match b {
            Some(s) => unix_ts(s) + offset,
            None => 0,
        }
    };
    insert(&mut obj, "min_date", json!(field(bounds.min)));
    insert(&mut obj, "max_date", json!(field(bounds.max)));
    Ok(obj)
}

// ---- Country inclusion / exclusion ----------------------------------------

/// `getCountryWeightedSum`: c0*0x10000 + c1*0x100 + c2 (alpha-3 char codes).
pub fn country_weighted_sum(country: &str) -> u64 {
    let b = country.as_bytes();
    (b[0] as u64) * 0x10000 + (b[1] as u64) * 0x100 + (b[2] as u64)
}

/// `getCountryFromWeightedSum`
pub fn country_from_weighted_sum(w: u64) -> String {
    let a = ((w / 0x10000) & 0xff) as u8;
    let b = ((w / 0x100) & 0xff) as u8;
    let c = (w & 0xff) as u8;
    String::from_utf8_lossy(&[a, b, c]).to_string()
}

/// Inclusion: `country_list` = 200 raw alpha-3 strings, zero-triple padded.
fn country_list_strings(countries: &[String]) -> Vec<String> {
    let zero = "\u{0}\u{0}\u{0}".to_string();
    let mut list = vec![zero; 200];
    for (i, c) in countries.iter().enumerate() {
        list[i] = c.clone();
    }
    list
}

/// Exclusion: `country_list` = 200 weighted sums, ascending, zero-padded.
fn country_list_sums(countries: &[String]) -> Vec<u64> {
    let mut sums: Vec<u64> = countries.iter().map(|c| country_weighted_sum(c)).collect();
    sums.sort_unstable();
    sums.resize(200, 0);
    sums
}

#[allow(clippy::too_many_arguments)]
pub fn get_country_inclusion_circuit_inputs(
    input: &DisclosureInput,
    countries: &[String],
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: Option<Value>,
) -> Result<Value, String> {
    let base = DisclosureBase::compute(input, salts)?;
    let mut obj = base_object(
        &base, input, salts, nullifier_secret, service_scope, service_subscope,
        current_date_timestamp, &oprf_proof,
    );
    insert(&mut obj, "country_list", json!(country_list_strings(countries)));
    Ok(obj)
}

#[allow(clippy::too_many_arguments)]
pub fn get_country_exclusion_circuit_inputs(
    input: &DisclosureInput,
    countries: &[String],
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: Option<Value>,
) -> Result<Value, String> {
    let base = DisclosureBase::compute(input, salts)?;
    let mut obj = base_object(
        &base, input, salts, nullifier_secret, service_scope, service_subscope,
        current_date_timestamp, &oprf_proof,
    );
    insert(&mut obj, "country_list", json!(country_list_sums(countries)));
    Ok(obj)
}

// ---- Disclose (disclose_bytes) --------------------------------------------

/// Which MRZ fields to disclose. Each true field fills 1s over its MRZ range.
#[derive(Default, Clone)]
pub struct DiscloseFields {
    pub firstname: bool,
    pub lastname: bool,
    pub fullname: bool,
    pub birthdate: bool,
    pub document_number: bool,
    pub nationality: bool,
    pub document_type: bool,
    pub expiry_date: bool,
    pub gender: bool,
    pub issuing_country: bool,
}

fn offset_in(mrz: &[u8], needle: &[u8], from: usize) -> usize {
    let n = needle.len();
    let mut i = from;
    while i + n <= mrz.len() {
        if &mrz[i..i + n] == needle {
            return i;
        }
        i += 1;
    }
    mrz.len()
}

/// The MRZ disclose ranges (`getters.ts`), returning [start, end) byte ranges.
fn mrz_ranges(mrz: &str, f: &DiscloseFields) -> Vec<(usize, usize)> {
    let bytes = mrz.as_bytes();
    let is_id = mrz.len() == 90;
    let ln_start = if is_id { 60 } else { 5 };
    let mut ranges = Vec::new();

    // lastname: [ln_start, indexOf("<<", ln_start)+2]
    let last_end = offset_in(bytes, b"<<", ln_start);
    if f.lastname {
        ranges.push((ln_start, last_end + 2));
    }
    // firstname
    if f.firstname {
        let mut fn_start = offset_in(bytes, b"<<", ln_start) + 2;
        let mut no_sep = false;
        if fn_start > 0 && fn_start < bytes.len() && bytes[fn_start] == b'<' {
            fn_start = offset_in(bytes, b"<", ln_start) + 1;
            no_sep = true;
        }
        let fn_end = offset_in(bytes, b"<", fn_start);
        ranges.push((fn_start - if no_sep { 1 } else { 2 }, fn_end));
    }
    if f.fullname {
        ranges.push((if is_id { 60 } else { 5 }, if is_id { 90 } else { 44 }));
    }
    if f.birthdate {
        ranges.push((if is_id { 30 } else { 57 }, if is_id { 36 } else { 63 }));
    }
    if f.document_number {
        ranges.push((if is_id { 5 } else { 44 }, if is_id { 14 } else { 53 }));
    }
    if f.nationality {
        ranges.push((if is_id { 45 } else { 54 }, if is_id { 48 } else { 57 }));
    }
    if f.document_type {
        ranges.push((0, 2));
    }
    if f.expiry_date {
        ranges.push((if is_id { 38 } else { 65 }, if is_id { 44 } else { 71 }));
    }
    if f.gender {
        ranges.push((if is_id { 37 } else { 64 }, if is_id { 38 } else { 65 }));
    }
    if f.issuing_country {
        ranges.push((2, 5));
    }
    ranges
}

/// `getDiscloseMask`: number[90], 1 over each disclosed range.
pub fn disclose_mask(mrz: &str, f: &DiscloseFields) -> Vec<u8> {
    let mut mask = vec![0u8; 90];
    for (start, end) in mrz_ranges(mrz, f) {
        for m in mask.iter_mut().take(end.min(90)).skip(start) {
            *m = 1;
        }
    }
    mask
}

#[allow(clippy::too_many_arguments)]
pub fn get_disclose_circuit_inputs(
    input: &DisclosureInput,
    fields: &DiscloseFields,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: Option<Value>,
) -> Result<Value, String> {
    let base = DisclosureBase::compute(input, salts)?;
    let mut obj = base_object(
        &base, input, salts, nullifier_secret, service_scope, service_subscope,
        current_date_timestamp, &oprf_proof,
    );
    insert(&mut obj, "disclose_mask", json!(disclose_mask(input.mrz, fields)));
    Ok(obj)
}

// ---- Disclosed value parsing (must match DisclosedData.fromDisclosedBytes) -

/// `formatName`: `<` → space, collapse whitespace (MRZ is uppercase ASCII, so
/// the diacritic folding in the TS never triggers here).
fn format_name(s: &str) -> String {
    let spaced: String = s.chars().map(|c| if c == '<' { ' ' } else { c }).collect();
    spaced.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// `stripChevrons`: trim leading/trailing `<`, inner `<` → space.
fn strip_chevrons(s: &str) -> String {
    s.trim_matches('<').replace('<', " ")
}

fn decode_strip(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).replace('\u{0}', "")
}

/// Passport `disclosedBytes` → the values the SDK's checker recomputes.
/// `disclosed` is the 90-byte MRZ region (dg1[5..]) with non-disclosed
/// positions zeroed. Only fields covered by the mask come back non-empty.
pub fn disclosed_values(disclosed: &[u8]) -> Value {
    let slice = |a: usize, b: usize| -> &[u8] { disclosed.get(a..b).unwrap_or(&[]) };
    // Name field [5,44): SURNAME<<GIVEN1<GIVEN2...
    let raw_name = decode_strip(slice(5, 44));
    let (last, given) = match raw_name.find("<<") {
        Some(i) => (raw_name[..i].to_string(), raw_name[i + 2..].to_string()),
        None => (String::new(), String::new()),
    };
    let first = match given.find('<') {
        Some(i) => given[..i].to_string(),
        None => given.clone(),
    };
    let full = format!("{given} {last}");
    let doc_type = {
        let dt = decode_strip(slice(0, 2));
        if dt.starts_with('P') {
            "passport"
        } else if dt == "IR" || dt == "AR" {
            "residence_permit"
        } else if dt.starts_with('I') {
            "id_card"
        } else {
            "other"
        }
    };
    json!({
        "firstname": format_name(&first),
        "lastname": format_name(&last),
        "fullname": format_name(&full),
        "nationality": decode_strip(slice(54, 57)),
        "issuing_country": decode_strip(slice(2, 5)),
        "document_number": strip_chevrons(&decode_strip(slice(44, 53))),
        "document_type": doc_type,
        "gender": decode_strip(slice(64, 65)),
        "birthdate": decode_strip(slice(57, 63)),   // raw YYMMDD
        "expiry_date": decode_strip(slice(65, 71)), // raw YYMMDD
    })
}

// ---- Bind -----------------------------------------------------------------

/// Bound data to commit to (subset without facematch).
#[derive(Default, Clone)]
pub struct BoundData {
    /// 0x-hex address bytes.
    pub user_address: Option<String>,
    /// Numeric chain id.
    pub chain_id: Option<u64>,
    pub custom_data: Option<String>,
}

fn hex_bytes(hex: &str) -> Vec<u8> {
    let hex = hex.strip_prefix("0x").unwrap_or(hex);
    (0..hex.len() / 2)
        .map(|i| u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).unwrap_or(0))
        .collect()
}

/// `formatBoundData`: TLV of {USER_ADDRESS=1, CHAIN_ID=2, CUSTOM_DATA=3}.
pub fn format_bound_data(b: &BoundData) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    if let Some(addr) = &b.user_address {
        let bytes = hex_bytes(addr);
        out.push(1);
        out.extend_from_slice(&[(bytes.len() >> 8) as u8, (bytes.len() & 0xff) as u8]);
        out.extend_from_slice(&bytes);
    }
    if let Some(chain) = b.chain_id {
        // Binary.fromHex(chainId.toString(16)).toNumberArray()
        let hex = format!("{chain:x}");
        let bytes = hex_bytes(if hex.len() % 2 == 1 {
            // Binary.fromHex left-pads odd to even
            return Err("odd chain id hex unsupported".into());
        } else {
            &hex
        });
        out.push(2);
        out.extend_from_slice(&[0, bytes.len() as u8]);
        out.extend_from_slice(&bytes);
    }
    if let Some(data) = &b.custom_data {
        let bytes = data.as_bytes();
        out.push(3);
        out.extend_from_slice(&[(bytes.len() >> 8) as u8, (bytes.len() & 0xff) as u8]);
        out.extend_from_slice(bytes);
    }
    if out.len() > 509 {
        return Err("bound data exceeds 509 bytes".into());
    }
    Ok(out)
}

#[allow(clippy::too_many_arguments)]
pub fn get_bind_circuit_inputs(
    input: &DisclosureInput,
    bound: &BoundData,
    salts: &IntegrityToDisclosureSalts,
    nullifier_secret: &BigUint,
    service_scope: &BigUint,
    service_subscope: &BigUint,
    current_date_timestamp: u64,
    oprf_proof: Option<Value>,
) -> Result<Value, String> {
    let base = DisclosureBase::compute(input, salts)?;
    let mut obj = base_object(
        &base, input, salts, nullifier_secret, service_scope, service_subscope,
        current_date_timestamp, &oprf_proof,
    );
    let data = right_pad_with_zeros(&format_bound_data(bound)?, 509);
    insert(&mut obj, "data", json!(data));
    Ok(obj)
}

/// Suppress unused import until the hide-sensitive path is wired.
#[allow(unused)]
fn _pack_unused(b: &[u8]) -> Vec<BigUint> {
    pack_be_bytes_into_field_elems(b, 31)
}
