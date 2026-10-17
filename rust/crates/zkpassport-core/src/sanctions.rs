//! Sanctions-exclusion input generation: byte-identical port of
//! `circuits/sanctions/sanctions.ts` (`SanctionsBuilder`) + `merkle-tree/async-ordered-mt.ts`
//! + the passport getters. Produces the non-membership merkle proofs the
//! `exclusion_check_sanctions` circuit consumes. Validated against a TS oracle.

use crate::poseidon2::poseidon2_hash;
use num_bigint::BigUint;
use num_traits::Zero;
use serde_json::{json, Value};

const BN254_MODULUS_MINUS_ONE_HEX: &str =
    "2523648240000001ba344d80000000086121000000000013a700000000000012";

/// `nodeToHex`: 0x-prefixed, 64-hex, lower-case.
fn node_hex(n: &BigUint) -> String {
    format!("0x{n:064x}")
}

fn parse_hex(s: &str) -> Result<BigUint, String> {
    BigUint::parse_bytes(s.trim_start_matches("0x").as_bytes(), 16)
        .ok_or_else(|| format!("bad hex node: {s}"))
}

// ---- Ordered merkle tree (AsyncOrderedMT) ----------------------------------

pub struct OrderedMt {
    depth: usize,
    layers: Vec<Vec<BigUint>>,
    entries: Vec<BigUint>, // sorted leaves + sentinels (layer0 minus trailing zero padding)
}

impl OrderedMt {
    /// `fromSerialized`: layers of hex strings; depth = layers-1; entries reconstructed from
    /// layer0 by trimming trailing ZERO_NODE padding.
    pub fn from_serialized(serialized: &[Vec<String>]) -> Result<Self, String> {
        if serialized.is_empty() {
            return Err("empty serialized tree".into());
        }
        let depth = serialized.len() - 1;
        let layers: Vec<Vec<BigUint>> = serialized
            .iter()
            .map(|layer| layer.iter().map(|s| parse_hex(s)).collect::<Result<_, _>>())
            .collect::<Result<_, _>>()?;
        for (level, layer) in layers.iter().enumerate() {
            let expected = 1usize << (depth - level);
            if layer.len() != expected {
                return Err(format!("layer {level} len {} != {expected}", layer.len()));
            }
        }
        let l0 = &layers[0];
        let mut count = l0.len();
        while count > 0 && l0[count - 1].is_zero() {
            count -= 1;
        }
        let entries = l0[0..count].to_vec();
        Ok(OrderedMt { depth, layers, entries })
    }

    pub fn root(&self) -> &BigUint {
        &self.layers[self.depth][0]
    }

    pub fn root_hex(&self) -> String {
        node_hex(self.root())
    }

    /// Binary search for `leaf` among `entries`. Returns (exists, index, leftIndex, rightIndex).
    fn find_boundaries(&self, leaf: &BigUint) -> (bool, Option<usize>, Option<usize>, Option<usize>) {
        let n = self.entries.len();
        if n == 0 {
            return (false, None, None, None);
        }
        let (mut low, mut high) = (0usize, n);
        while low < high {
            let mid = (low + high) >> 1;
            if &self.entries[mid] < leaf {
                low = mid + 1;
            } else {
                high = mid;
            }
        }
        let pos = low;
        let exists = pos < n && &self.entries[pos] == leaf;
        let left = if pos >= 1 { Some(pos - 1) } else { None };
        let rpos = if exists { pos + 1 } else { pos };
        let right = if rpos < n { Some(rpos) } else { None };
        (exists, exists.then_some(pos), left, right)
    }

    /// `createMembershipProof` for the entry at `index`: (leaf, leaf_index, siblings).
    fn membership_proof(&self, index: usize) -> (BigUint, usize, Vec<BigUint>) {
        let leaf = self.entries[index].clone();
        let mut siblings = Vec::with_capacity(self.depth);
        let mut idx = index;
        for level in 0..self.depth {
            let sib_idx = if idx & 1 == 1 { idx - 1 } else { idx + 1 };
            siblings.push(self.layers[level][sib_idx].clone());
            idx >>= 1;
        }
        (leaf, index, siblings)
    }

    /// `formatSanctionsProof` side. A `None` boundary (target outside the sentinels — e.g. a
    /// leaf hash above the smaller BN254_MODULUS_MINUS_ONE sentinel) reproduces the TS's
    /// optional-chaining result: `"0xundefined"` + empty sibling_path.
    fn inclusion_json(&self, index: Option<usize>) -> Value {
        match index {
            Some(i) => {
                let (leaf, idx, sibs) = self.membership_proof(i);
                json!({
                    "leaf": node_hex(&leaf),
                    "leaf_index": node_hex(&BigUint::from(idx)),
                    "sibling_path": sibs.iter().map(node_hex).collect::<Vec<_>>(),
                })
            }
            None => json!({ "leaf": "0xundefined", "leaf_index": "0xundefined", "sibling_path": [] }),
        }
    }

    /// `createNonMembershipProof` + `formatSanctionsProof`: {left, right} inclusion proofs for
    /// the two adjacent entries bracketing `target`.
    pub fn non_membership_formatted(&self, target: &BigUint) -> Result<Value, String> {
        let (exists, _idx, left_i, right_i) = self.find_boundaries(target);
        if exists {
            return Err("target exists; use membership proof".into());
        }
        Ok(json!({ "left": self.inclusion_json(left_i), "right": self.inclusion_json(right_i) }))
    }
}

// ---- Passport getters (TD3 len 88 vs TD1 len 90) ---------------------------

fn get_offset(b: &[u8], pat: &[u8], start: usize) -> i64 {
    let mut i = start;
    while i + pat.len() <= b.len() {
        if &b[i..i + pat.len()] == pat {
            return i as i64;
        }
        i += 1;
    }
    -1
}

fn is_id(mrz: &str) -> bool {
    mrz.len() == 90
}

fn full_name_range(mrz: &str) -> (i64, i64) {
    if is_id(mrz) {
        (60, 90)
    } else {
        (5, 44)
    }
}

fn first_name_range(mrz: &str) -> (i64, i64) {
    let b = mrz.as_bytes();
    let last_name_start = if is_id(mrz) { 60 } else { 5 };
    let mut first_start = get_offset(b, b"<<", last_name_start) + 2;
    let mut without_sep = false;
    if first_start > 0 && (first_start as usize) < mrz.len() && b[first_start as usize] == b'<' {
        first_start = get_offset(b, b"<", last_name_start) + 1;
        without_sep = true;
    }
    let first_end = get_offset(b, b"<", first_start.max(0) as usize);
    (first_start - if without_sep { 1 } else { 2 }, first_end)
}

fn second_name_range(mrz: &str) -> (i64, i64) {
    let b = mrz.as_bytes();
    let start = first_name_range(mrz).1 + 1;
    let end = get_offset(b, b"<", start.max(0) as usize);
    (start - 1, end)
}

fn third_name_range(mrz: &str) -> (i64, i64) {
    let b = mrz.as_bytes();
    let start = second_name_range(mrz).1 + 1;
    let end = get_offset(b, b"<", start.max(0) as usize);
    (start - 1, end)
}

fn birthdate_range(mrz: &str) -> (usize, usize) {
    if is_id(mrz) {
        (30, 36)
    } else {
        (57, 63)
    }
}

fn document_number_range(mrz: &str) -> (usize, usize) {
    if is_id(mrz) {
        (5, 14)
    } else {
        (44, 53)
    }
}

fn nationality_range(mrz: &str) -> (usize, usize) {
    if is_id(mrz) {
        (45, 48)
    } else {
        (54, 57)
    }
}

fn nationality(mrz: &str) -> String {
    let (s, e) = nationality_range(mrz);
    let raw = slice(mrz, s as i64, e as i64);
    if raw == "D<<" {
        "DEU".to_string()
    } else {
        raw
    }
}

/// JS `String.slice(start, end)`: clamp to [0,len]; empty when start >= end.
fn slice(s: &str, start: i64, end: i64) -> String {
    let len = s.len() as i64;
    let a = start.clamp(0, len) as usize;
    let b = end.clamp(0, len) as usize;
    if a >= b {
        String::new()
    } else {
        s[a..b].to_string()
    }
}

fn pad_end_39(s: &str) -> String {
    let mut out = s.to_string();
    while out.len() < 39 {
        out.push('<');
    }
    out
}

/// `processName`: normalize a single-separator name to the `X<<Y` form (dropping the last
/// char to keep length), leaving double-separator names untouched.
fn process_name(name: &str) -> String {
    let b = name.as_bytes();
    let az = |x: u8| x.is_ascii_uppercase();
    // [A-Z]<<[A-Z]
    let mut full_idx: i64 = -1;
    let mut i = 0usize;
    while i + 3 < b.len() {
        if az(b[i]) && b[i + 1] == b'<' && b[i + 2] == b'<' && az(b[i + 3]) {
            full_idx = i as i64;
            break;
        }
        i += 1;
    }
    if full_idx >= 0 {
        return name.to_string();
    }
    // [A-Z]<[A-Z]
    let mut single_idx: i64 = -1;
    let mut j = 0usize;
    while j + 2 < b.len() {
        if az(b[j]) && b[j + 1] == b'<' && az(b[j + 2]) {
            single_idx = j as i64;
            break;
        }
        j += 1;
    }
    if single_idx >= 0 {
        let k = single_idx as usize;
        // name.slice(0, k+1) + "<<" + name.slice(k+2, -1)
        let mut out = name[0..k + 1].to_string();
        out.push_str("<<");
        out.push_str(&slice(name, (k + 2) as i64, name.len() as i64 - 1));
        return out;
    }
    name.to_string()
}

/// `getNameCombinations`: three progressively-longer name slices, padded to 39, processed.
fn name_combinations(mrz: &str) -> [String; 3] {
    let (full_start, full_end) = full_name_range(mrz);
    let mut first_end = first_name_range(mrz).1.min(full_end);
    if first_end < 0 {
        first_end = full_end;
    }
    let name1 = pad_end_39(&slice(mrz, full_start, first_end));
    let mut second_end = if first_end == full_end {
        full_end
    } else {
        second_name_range(mrz).1.min(full_end)
    };
    if second_end < 0 {
        second_end = full_end;
    }
    let name2 = pad_end_39(&slice(mrz, full_start, second_end));
    let mut third_end = if second_end == full_end {
        full_end
    } else {
        third_name_range(mrz).1.min(full_end)
    };
    if third_end < 0 {
        third_end = full_end;
    }
    let name3 = pad_end_39(&slice(mrz, full_start, third_end));
    [process_name(&name1), process_name(&name2), process_name(&name3)]
}

// ---- Leaf hashes -----------------------------------------------------------

fn ascii_fields(s: &str) -> Vec<BigUint> {
    s.chars().map(|c| BigUint::from(c as u32)).collect()
}

/// The ten sanctions leaf hashes for a passport MRZ.
pub struct SanctionsLeaves {
    pub names: [BigUint; 3],
    pub name_and_dob: [BigUint; 3],
    pub name_and_yob: [BigUint; 3],
    pub doc_and_nationality: BigUint,
}

pub fn sanctions_leaves(mrz: &str) -> SanctionsLeaves {
    let names = name_combinations(mrz);
    let name_f: Vec<Vec<BigUint>> = names.iter().map(|n| ascii_fields(n)).collect();

    let (bs, be) = birthdate_range(mrz);
    let dob = ascii_fields(&slice(mrz, bs as i64, be as i64)); // 6
    let yob: Vec<BigUint> = dob[0..2].to_vec(); // 2
    let (ds, de) = document_number_range(mrz);
    let docn = ascii_fields(&slice(mrz, ds as i64, de as i64)); // 9
    let nat = ascii_fields(&nationality(mrz)); // 3

    let hash = |v: &[BigUint]| poseidon2_hash(v);
    let name_hash = |i: usize| hash(&name_f[i]);
    let name_dob = |i: usize| {
        let mut p = name_f[i].clone();
        p.extend_from_slice(&dob);
        hash(&p)
    };
    let name_yob = |i: usize| {
        let mut p = name_f[i].clone();
        p.extend_from_slice(&yob);
        hash(&p)
    };
    let mut dn = docn.clone();
    dn.extend_from_slice(&nat);

    SanctionsLeaves {
        names: [name_hash(0), name_hash(1), name_hash(2)],
        name_and_dob: [name_dob(0), name_dob(1), name_dob(2)],
        name_and_yob: [name_yob(0), name_yob(1), name_yob(2)],
        doc_and_nationality: hash(&dn),
    }
}

/// `getSanctionsMerkleProofs` → the formatted `proofs` object the circuit takes. In non-strict
/// mode the three name-only proofs use a dummy target of 1 (the circuit ignores them).
pub fn build_sanctions_proofs(mrz: &str, tree: &OrderedMt, is_strict: bool) -> Result<Value, String> {
    let leaves = sanctions_leaves(mrz);
    let one = BigUint::from(1u8);
    let name_target = |i: usize| -> &BigUint {
        if is_strict {
            &leaves.names[i]
        } else {
            &one
        }
    };
    let name_proofs = vec![
        tree.non_membership_formatted(name_target(0))?,
        tree.non_membership_formatted(name_target(1))?,
        tree.non_membership_formatted(name_target(2))?,
    ];
    let name_and_dob_proofs = vec![
        tree.non_membership_formatted(&leaves.name_and_dob[0])?,
        tree.non_membership_formatted(&leaves.name_and_dob[1])?,
        tree.non_membership_formatted(&leaves.name_and_dob[2])?,
    ];
    let name_and_yob_proofs = vec![
        tree.non_membership_formatted(&leaves.name_and_yob[0])?,
        tree.non_membership_formatted(&leaves.name_and_yob[1])?,
        tree.non_membership_formatted(&leaves.name_and_yob[2])?,
    ];
    let passport = tree.non_membership_formatted(&leaves.doc_and_nationality)?;
    Ok(json!({
        "name_proofs": name_proofs,
        "name_and_dob_proofs": name_and_dob_proofs,
        "name_and_yob_proofs": name_and_yob_proofs,
        "passport_no_and_nationality_proof": passport,
    }))
}

/// Exposed for a sanity check: the module hard-codes BN254-1 as the upper sentinel.
pub fn bn254_modulus_minus_one() -> BigUint {
    parse_hex(BN254_MODULUS_MINUS_ONE_HEX).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn oracle() -> Value {
        let raw = include_str!("../tests/fixtures/sanctions-oracle.json");
        serde_json::from_str(raw).unwrap()
    }

    #[test]
    fn leaf_hashes_match_ts() {
        let o = oracle();
        let mrz = o["mrz"].as_str().unwrap();
        // name combinations
        let names = name_combinations(mrz);
        let exp_names: Vec<String> = o["name_combinations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert_eq!(names.to_vec(), exp_names, "name_combinations");

        let l = sanctions_leaves(mrz);
        let lh = &o["leaf_hashes"];
        let eq = |got: &BigUint, key: &str| {
            assert_eq!(format!("0x{got:x}"), lh[key].as_str().unwrap(), "leaf {key}");
        };
        eq(&l.names[0], "name1");
        eq(&l.names[1], "name2");
        eq(&l.names[2], "name3");
        eq(&l.name_and_dob[0], "name1_dob");
        eq(&l.name_and_dob[1], "name2_dob");
        eq(&l.name_and_dob[2], "name3_dob");
        eq(&l.name_and_yob[0], "name1_yob");
        eq(&l.name_and_yob[1], "name2_yob");
        eq(&l.name_and_yob[2], "name3_yob");
        eq(&l.doc_and_nationality, "docn_nat");
    }

    #[test]
    fn proofs_and_root_match_ts() {
        let o = oracle();
        let mrz = o["mrz"].as_str().unwrap();
        let serialized: Vec<Vec<String>> = o["serialized_tree"]
            .as_array()
            .unwrap()
            .iter()
            .map(|layer| {
                layer
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|n| n.as_str().unwrap().to_string())
                    .collect()
            })
            .collect();
        let tree = OrderedMt::from_serialized(&serialized).unwrap();
        assert_eq!(tree.root_hex(), o["root"].as_str().unwrap(), "root");

        let non_strict = build_sanctions_proofs(mrz, &tree, false).unwrap();
        assert_eq!(&non_strict, &o["proofs_non_strict"], "proofs_non_strict");
        let strict = build_sanctions_proofs(mrz, &tree, true).unwrap();
        assert_eq!(&strict, &o["proofs_strict"], "proofs_strict");
    }
}
