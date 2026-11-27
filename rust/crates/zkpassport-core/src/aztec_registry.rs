//! Latest certificate, circuit and sanctions roots of ZKPassportRegistry, ZKPassport's registry
//! contract on an Aztec network: the JSON-RPC requests to an Aztec node and the check of its
//! replies. Port of `AztecRegistryReader.getLatestRoot` in `@zkpassport/registry`.
//!
//! The roots are read from the registry's public storage, as its private functions read them at
//! the node's latest block: a change scheduled within the registry's delay is ignored until its
//! time comes. The read takes two requests, as every storage read names the block number the
//! first request returns. A block landing between reads of "latest" would mix the storage of
//! two blocks.

use crate::latest_roots::{is_registry_root, LatestRoots};
use crate::poseidon2::poseidon2_hash;
use num_bigint::BigUint;
use serde_json::{json, Value};

/// The id of Aztec mainnet as a bound chain: its rollup version, as an Aztec network has no
/// EIP-155 chain id.
pub const AZTEC_CHAIN_ID: u64 = 2070860440;
/// The id of the Aztec testnet as a bound chain: its rollup version.
pub const AZTEC_TESTNET_CHAIN_ID: u64 = 679261766;

/// An Aztec network's node and registry, as in `networks.ts` of `@zkpassport/registry`.
pub(crate) struct AztecNetwork {
    pub node_url: &'static str,
    registry: &'static str,
}

impl AztecNetwork {
    pub(crate) fn of_chain(chain_id: u64) -> Option<Self> {
        match chain_id {
            AZTEC_CHAIN_ID => Some(Self {
                node_url: "https://aztec-mainnet.drpc.org",
                registry: "0x1478d06759c62f151751aa08e2ce8950dd49e9891c40b9a93774a4686000e8fc",
            }),
            AZTEC_TESTNET_CHAIN_ID => Some(Self {
                node_url: "https://aztec-testnet.drpc.org",
                registry: "0x019de2b2c83e178733dce20707949a17ec3465caba6ccd24b3d861f151bf0f30",
            }),
            _ => None,
        }
    }

    /// The request for the roots at one block, given the node's reply to
    /// [`block_number_request`]. Read its reply with [`parse_latest_roots`].
    pub(crate) fn latest_roots_request(&self, block_number_reply: &str) -> Result<String, String> {
        let block_number = batch_results(block_number_reply, 1)?[0]
            .as_u64()
            .ok_or("the Aztec node returned no block number")?;

        let mut calls = vec![call(0, "node_getBlockData", json!([block_number]))];
        for slot in latest_root_slots() {
            calls.push(call(
                calls.len(),
                "node_getPublicStorageAt",
                json!([block_number, self.registry, format!("0x{slot:064x}")]),
            ));
        }
        Ok(Value::Array(calls).to_string())
    }
}

/// The request for the number of the node's latest block.
pub(crate) fn block_number_request() -> String {
    json!([call(0, "node_getBlockNumber", json!([]))]).to_string()
}

/// Reads the roots from the node's reply to [`AztecNetwork::latest_roots_request`]. The reply
/// comes from the network, so anything but three well-formed roots is an error.
pub(crate) fn parse_latest_roots(reply: &str) -> Result<LatestRoots, String> {
    let results = batch_results(reply, 1 + REGISTRY_IDS.len() * LATEST_ROOT_PAIR_SLOTS)?;
    let now = block_timestamp(&results[0])?;

    let mut roots = Vec::with_capacity(REGISTRY_IDS.len());
    for (registry_id, words) in REGISTRY_IDS.iter().zip(results[1..].chunks(LATEST_ROOT_PAIR_SLOTS)) {
        let change_timestamp = low_32_bits(&storage_word(&words[0])?);
        let latest_before_change = &words[1];
        let latest_after_change = &words[1 + LATEST_ROOT_PAIR_LENGTH];
        let latest = storage_word(if now < change_timestamp {
            latest_before_change
        } else {
            latest_after_change
        })?;

        let root = format!("0x{latest:064x}");
        if !is_registry_root(&root) {
            return Err(format!("the Aztec registry has no root for registry {registry_id}"));
        }
        roots.push(root);
    }

    let [certificates, circuits, sanctions]: [String; 3] =
        roots.try_into().map_err(|_| "the Aztec registry reply has no three roots")?;
    Ok(LatestRoots { certificates, circuits, sanctions })
}

/// The certificate, circuit and sanctions registry ids, in the order the roots are read.
const REGISTRY_IDS: [u64; 3] = [1, 2, 3];

/// The slot of `latest`, the registry's map from a registry id to its LatestRootPair, from the
/// contract's compiled storage layout.
const LATEST_SLOT: u64 = 8;
/// Packed length of LatestRootPair (latest, previous).
const LATEST_ROOT_PAIR_LENGTH: usize = 2;
/// The slots read of a LatestRootPair in a DelayedPublicMutable: the scheduled change's
/// timestamp (the low 32 bits of the first slot), the value before the change and the value
/// after it.
const LATEST_ROOT_PAIR_SLOTS: usize = 2 * LATEST_ROOT_PAIR_LENGTH + 1;

/// Aztec's PUBLIC_STORAGE_MAP_SLOT domain separator, from @aztec-labs/constants.
const PUBLIC_STORAGE_MAP_SLOT_SEPARATOR: u64 = 4015149901;

/// Every slot of each registry id's LatestRootPair, in the order of [`REGISTRY_IDS`].
fn latest_root_slots() -> Vec<BigUint> {
    REGISTRY_IDS
        .iter()
        .flat_map(|&registry_id| {
            let first = map_slot(LATEST_SLOT, registry_id);
            (0..LATEST_ROOT_PAIR_SLOTS).map(move |offset| &first + BigUint::from(offset))
        })
        .collect()
}

/// The storage slot of `map[key]` for the map at `slot`.
fn map_slot(slot: u64, key: u64) -> BigUint {
    poseidon2_hash(&[PUBLIC_STORAGE_MAP_SLOT_SEPARATOR.into(), slot.into(), key.into()])
}

fn call(id: usize, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

/// The results of a batch of `count` calls with the ids `0..count`, in order. An Aztec node
/// puts each call's error in its reply, so a missing reply or one with an error fails the read.
fn batch_results(reply: &str, count: usize) -> Result<Vec<Value>, String> {
    let replies: Vec<Value> = serde_json::from_str(reply)
        .map_err(|e| format!("the Aztec node did not answer the batch: {e}"))?;
    (0..count)
        .map(|id| {
            let reply = replies
                .iter()
                .find(|reply| reply["id"] == id)
                .ok_or_else(|| format!("the Aztec node did not reply to call {id}"))?;
            if !reply["error"].is_null() {
                return Err(format!("error from the Aztec node: {}", reply["error"]["message"]));
            }
            Ok(reply["result"].clone())
        })
        .collect()
}

/// The timestamp of a block the node returned, in seconds.
fn block_timestamp(block: &Value) -> Result<u64, String> {
    let timestamp = &block["header"]["globalVariables"]["timestamp"];
    timestamp
        .as_u64()
        .or_else(|| timestamp.as_str().and_then(|seconds| seconds.parse().ok()))
        .ok_or_else(|| "the Aztec node returned no block".to_string())
}

fn storage_word(word: &Value) -> Result<BigUint, String> {
    word.as_str()
        .and_then(|word| word.strip_prefix("0x"))
        .filter(|hex| (1..=64).contains(&hex.len()))
        .and_then(|hex| BigUint::parse_bytes(hex.as_bytes(), 16))
        .ok_or_else(|| format!("the Aztec node returned {word} as a storage value"))
}

fn low_32_bits(word: &BigUint) -> u64 {
    word.iter_u32_digits().next().unwrap_or(0).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    const TESTNET_REGISTRY: &str =
        "0x019de2b2c83e178733dce20707949a17ec3465caba6ccd24b3d861f151bf0f30";
    const BLOCK_NUMBER: u64 = 74136;
    const BLOCK_TIMESTAMP: u64 = 5100;

    const ROOT_A: &str = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const ROOT_B: &str = "0x2222222222222222222222222222222222222222222222222222222222222222";
    const CIRCUITS_ROOT: &str =
        "0x0289526299c3d1afa2ad1113678fb426ed587156a1a4ba622023d81989728210";
    const SANCTIONS_ROOT: &str =
        "0x0d839b2da9dec05643a463376da92a2a2d10f0f8610cdd2e0b74d84fa5208b68";
    const ZERO: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";

    fn testnet() -> AztecNetwork {
        AztecNetwork::of_chain(AZTEC_TESTNET_CHAIN_ID).unwrap()
    }

    fn block_number_reply() -> String {
        json!([{ "jsonrpc": "2.0", "id": 0, "result": BLOCK_NUMBER }]).to_string()
    }

    /// The five slots of a LatestRootPair whose latest root changes from `before` to `after` at
    /// `change_at`.
    fn latest_pair(before: &str, after: &str, change_at: u64) -> [String; 5] {
        [
            format!("0x{change_at:064x}"),
            before.to_string(),
            ZERO.to_string(),
            after.to_string(),
            before.to_string(),
        ]
    }

    fn settled(root: &str) -> [String; 5] {
        latest_pair(ZERO, root, 0)
    }

    /// The node's reply to the roots request: the block, then each registry's slots.
    fn roots_reply(timestamp: Value, pairs: [[String; 5]; 3]) -> String {
        let block = json!({ "header": { "globalVariables": { "timestamp": timestamp } } });
        let mut answers = vec![json!({ "jsonrpc": "2.0", "id": 0, "result": block })];
        for word in pairs.iter().flatten() {
            answers.push(json!({ "jsonrpc": "2.0", "id": answers.len(), "result": word }));
        }
        Value::Array(answers).to_string()
    }

    fn settled_reply() -> String {
        roots_reply(
            json!(BLOCK_TIMESTAMP.to_string()),
            [settled(ROOT_A), settled(CIRCUITS_ROOT), settled(SANCTIONS_ROOT)],
        )
    }

    #[test]
    fn map_slots_match_aztec_stdlib() {
        // deriveStorageSlotInMap of @aztec-labs/stdlib over the `latest` map and each registry id
        let expected = [
            "cf8ce2bc3b2b2ae03caaab0d8e620df5c780e2b09a43f0b9bd0458847308ca4",
            "2f2f2c711b07c5b3e451652f95e973cd3fddc316ad99df65e9872ea652c5050",
            "1ff113a83ed3e36ef00580b705cf6d26496d42ad7de586d222f15796dc43983c",
        ];

        for (registry_id, slot) in REGISTRY_IDS.iter().zip(expected) {
            assert_eq!(map_slot(LATEST_SLOT, *registry_id).to_str_radix(16), slot);
        }
    }

    #[test]
    fn first_request_asks_for_the_latest_block_number() {
        let calls: Vec<Value> = serde_json::from_str(&block_number_request()).unwrap();

        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0]["id"], 0);
        assert_eq!(calls[0]["method"], "node_getBlockNumber");
    }

    #[test]
    fn roots_request_reads_the_block_and_every_slot_at_the_returned_block() {
        let body = testnet().latest_roots_request(&block_number_reply()).unwrap();
        let calls: Vec<Value> = serde_json::from_str(&body).unwrap();

        assert_eq!(calls.len(), 16);
        assert_eq!(calls[0]["method"], "node_getBlockData");
        assert_eq!(calls[0]["params"], json!([BLOCK_NUMBER]));
        for (index, call) in calls.iter().enumerate() {
            assert_eq!(call["id"], index);
        }
        for call in &calls[1..] {
            assert_eq!(call["method"], "node_getPublicStorageAt");
            assert_eq!(call["params"][0], BLOCK_NUMBER);
            assert_eq!(call["params"][1], TESTNET_REGISTRY);
        }
        let certificate_slot = |offset: u8| {
            format!("0x0cf8ce2bc3b2b2ae03caaab0d8e620df5c780e2b09a43f0b9bd0458847308c{:02x}", 0xa4 + offset)
        };
        for offset in 0..5u8 {
            assert_eq!(calls[1 + offset as usize]["params"][2], certificate_slot(offset));
        }
        assert_eq!(
            calls[6]["params"][2],
            "0x02f2f2c711b07c5b3e451652f95e973cd3fddc316ad99df65e9872ea652c5050"
        );
        assert_eq!(
            calls[11]["params"][2],
            "0x1ff113a83ed3e36ef00580b705cf6d26496d42ad7de586d222f15796dc43983c"
        );
    }

    #[test]
    fn roots_request_fails_without_a_block_number() {
        let unusable_replies = [
            "<html>502 Bad Gateway</html>".to_string(),
            json!([]).to_string(),
            json!([{ "jsonrpc": "2.0", "id": 0, "result": "latest" }]).to_string(),
            json!([{ "jsonrpc": "2.0", "id": 0, "error": { "code": -32603, "message": "down" } }])
                .to_string(),
        ];

        for reply in unusable_replies {
            assert!(testnet().latest_roots_request(&reply).is_err(), "{reply}");
        }
    }

    #[test]
    fn reads_each_registrys_latest_root() {
        let roots = parse_latest_roots(&settled_reply()).unwrap();

        assert_eq!(roots.certificates, ROOT_A);
        assert_eq!(roots.circuits, CIRCUITS_ROOT);
        assert_eq!(roots.sanctions, SANCTIONS_ROOT);
    }

    #[test]
    fn ignores_a_scheduled_root_until_its_time_comes() {
        let change_at = BLOCK_TIMESTAMP;
        let reply_at = |timestamp: u64| {
            roots_reply(
                json!(timestamp.to_string()),
                [
                    latest_pair(ROOT_A, ROOT_B, change_at),
                    settled(CIRCUITS_ROOT),
                    settled(SANCTIONS_ROOT),
                ],
            )
        };

        let before = parse_latest_roots(&reply_at(change_at - 1)).unwrap();
        let at = parse_latest_roots(&reply_at(change_at)).unwrap();

        assert_eq!(before.certificates, ROOT_A);
        assert_eq!(at.certificates, ROOT_B);
    }

    #[test]
    fn reads_the_change_timestamp_from_the_low_32_bits_of_its_slot() {
        let change_at = BLOCK_TIMESTAMP + 1;
        let mut certificates = latest_pair(ROOT_A, ROOT_B, change_at);
        // The bits above hold the scheduled change of the delay itself
        certificates[0] = format!("0x{:064x}", (0xabcdu128 << 32) | change_at as u128);
        let reply = roots_reply(
            json!(BLOCK_TIMESTAMP.to_string()),
            [certificates, settled(CIRCUITS_ROOT), settled(SANCTIONS_ROOT)],
        );

        assert_eq!(parse_latest_roots(&reply).unwrap().certificates, ROOT_A);
    }

    #[test]
    fn accepts_a_numeric_block_timestamp() {
        let reply = roots_reply(
            json!(BLOCK_TIMESTAMP),
            [settled(ROOT_A), settled(CIRCUITS_ROOT), settled(SANCTIONS_ROOT)],
        );

        assert_eq!(parse_latest_roots(&reply).unwrap().certificates, ROOT_A);
    }

    #[test]
    fn rejects_a_reply_without_three_usable_roots() {
        let settled_answers: Vec<Value> = serde_json::from_str(&settled_reply()).unwrap();
        let without_last_slot = Value::Array(settled_answers[..15].to_vec()).to_string();
        let mut with_error = settled_answers.clone();
        with_error[4] =
            json!({ "jsonrpc": "2.0", "id": 4, "error": { "code": -32702, "message": "Block not found" } });
        let mut with_bad_word = settled_answers.clone();
        with_bad_word[4]["result"] = json!("0x");
        let mut without_block = settled_answers;
        without_block[0]["result"] = Value::Null;

        let unusable_replies = [
            "<html>502 Bad Gateway</html>".to_string(),
            without_last_slot,
            Value::Array(with_error).to_string(),
            Value::Array(with_bad_word).to_string(),
            Value::Array(without_block).to_string(),
            roots_reply(
                json!(BLOCK_TIMESTAMP.to_string()),
                [settled(ROOT_A), settled(CIRCUITS_ROOT), settled(ZERO)],
            ),
        ];

        for reply in unusable_replies {
            assert!(parse_latest_roots(&reply).is_err(), "{reply}");
        }
    }
}
