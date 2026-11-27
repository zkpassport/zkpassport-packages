//! Latest certificate, circuit and sanctions roots of a chain's registry: the JSON-RPC
//! requests and the check of their replies. The platform runner only sends the requests.
//! Port of `getLatestRoot` in `@zkpassport/registry`.
//!
//! On an EVM chain the registry is the Root Registry contract, read with one request. On an
//! Aztec network it is ZKPassportRegistry, read with two (see [`crate::aztec_registry`]).

use crate::aztec_registry::{self, AztecNetwork};
use serde_json::{json, Value};

/// Same address on every supported chain.
const ROOT_REGISTRY: &str = "0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70";
/// `latestRoot(bytes32)`
const LATEST_ROOT_SELECTOR: &str = "0xc3bc16e8";
const CERTIFICATE_REGISTRY_ID: u64 = 1;
const CIRCUIT_REGISTRY_ID: u64 = 2;
const SANCTIONS_REGISTRY_ID: u64 = 3;

/// The endpoints `@zkpassport/registry` uses (`networks.ts`) for the chains
/// the core supports, so the prover and the verifier see the same roots.
fn rpc_url(chain_id: u64) -> Option<&'static str> {
    match chain_id {
        1 => Some("https://eth-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G"),
        8453 => Some("https://base-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G"),
        11155111 => Some("https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G"),
        _ => None,
    }
}

pub struct LatestRootsRequest {
    pub url: &'static str,
    /// JSON to POST with `Content-Type: application/json`.
    pub body: String,
}

pub struct LatestRoots {
    pub certificates: String,
    pub circuits: String,
    pub sanctions: String,
}

/// A step of reading a chain's latest roots.
pub enum LatestRootsStep {
    /// Send this request and call [`latest_roots_step`] again with its reply added.
    Request(LatestRootsRequest),
    Roots(LatestRoots),
}

/// The next step of reading the latest roots of the registry on `chain_id`, an EVM chain or an
/// Aztec network. `replies` holds the reply to each request made so far, in order, starting
/// empty.
pub fn latest_roots_step(chain_id: u64, replies: &[&str]) -> Result<LatestRootsStep, String> {
    use LatestRootsStep::{Request, Roots};

    if let Some(network) = AztecNetwork::of_chain(chain_id) {
        let request = |body| Request(LatestRootsRequest { url: network.node_url, body });
        return match replies {
            [] => Ok(request(aztec_registry::block_number_request())),
            [block_number] => Ok(request(network.latest_roots_request(block_number)?)),
            [_, roots] => Ok(Roots(aztec_registry::parse_latest_roots(roots)?)),
            _ => Err("more replies than requests".into()),
        };
    }

    match replies {
        [] => Ok(Request(latest_roots_request(chain_id)?)),
        [roots] => Ok(Roots(parse_latest_roots(roots)?)),
        _ => Err("more replies than requests".into()),
    }
}

/// One request that asks an EVM chain's Root Registry for the three roots.
pub fn latest_roots_request(chain_id: u64) -> Result<LatestRootsRequest, String> {
    let url = rpc_url(chain_id).ok_or_else(|| format!("no registry on chain {chain_id}"))?;
    let latest_root_call = |registry_id: u64| {
        json!({
            "jsonrpc": "2.0",
            "id": registry_id,
            "method": "eth_call",
            "params": [
                { "to": ROOT_REGISTRY, "data": format!("{LATEST_ROOT_SELECTOR}{registry_id:064x}") },
                "latest",
            ],
        })
    };
    let body = json!([
        latest_root_call(CERTIFICATE_REGISTRY_ID),
        latest_root_call(CIRCUIT_REGISTRY_ID),
        latest_root_call(SANCTIONS_REGISTRY_ID),
    ]);
    Ok(LatestRootsRequest {
        url,
        body: body.to_string(),
    })
}

/// Reads the roots from the reply to [`latest_roots_request`]. The reply
/// comes from the network, so anything but three well-formed roots is an error.
pub fn parse_latest_roots(reply: &str) -> Result<LatestRoots, String> {
    let answers: Vec<Value> =
        serde_json::from_str(reply).map_err(|e| format!("registry reply is not valid: {e}"))?;
    let root_of = |registry_id: u64| {
        answers
            .iter()
            .find(|answer| answer["id"] == registry_id)
            .and_then(|answer| answer["result"].as_str())
            .filter(|root| is_registry_root(root))
            .map(str::to_lowercase)
            .ok_or_else(|| format!("registry reply has no root for registry {registry_id}"))
    };
    Ok(LatestRoots {
        certificates: root_of(CERTIFICATE_REGISTRY_ID)?,
        circuits: root_of(CIRCUIT_REGISTRY_ID)?,
        sanctions: root_of(SANCTIONS_REGISTRY_ID)?,
    })
}

/// A registry answers with a zero root for a registry id it does not know.
pub(crate) fn is_registry_root(root: &str) -> bool {
    match root.strip_prefix("0x") {
        Some(hex) => {
            hex.len() == 64
                && hex.bytes().all(|digit| digit.is_ascii_hexdigit())
                && hex.bytes().any(|digit| digit != b'0')
        }
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CERTIFICATES_ROOT: &str =
        "0x103662fb872f5dba268c67fdc7600243b4741215d7442657539b4c39e461876c";
    const CIRCUITS_ROOT: &str =
        "0x0289526299c3d1afa2ad1113678fb426ed587156a1a4ba622023d81989728210";
    const SANCTIONS_ROOT: &str =
        "0x0d839b2da9dec05643a463376da92a2a2d10f0f8610cdd2e0b74d84fa5208b68";

    fn answer(registry_id: u64, root: &str) -> Value {
        json!({ "jsonrpc": "2.0", "id": registry_id, "result": root })
    }

    #[test]
    fn request_calls_latest_root_for_the_three_registries() {
        let request = latest_roots_request(1).unwrap();
        let calls: Vec<Value> = serde_json::from_str(&request.body).unwrap();

        assert!(request.url.starts_with("https://eth-mainnet."));
        assert_eq!(calls.len(), 3);
        for (call, registry_id) in calls.iter().zip([1u64, 2, 3]) {
            assert_eq!(call["id"], registry_id);
            assert_eq!(call["method"], "eth_call");
            assert_eq!(call["params"][0]["to"], ROOT_REGISTRY);
            assert_eq!(
                call["params"][0]["data"],
                format!("0xc3bc16e8{}{registry_id}", "0".repeat(63))
            );
        }
    }

    #[test]
    fn request_fails_for_a_chain_without_registry() {
        assert!(latest_roots_request(84532).is_err());
    }

    #[test]
    fn evm_chain_takes_one_request() {
        let reply = json!([
            answer(1, CERTIFICATES_ROOT),
            answer(2, CIRCUITS_ROOT),
            answer(3, SANCTIONS_ROOT),
        ])
        .to_string();

        let LatestRootsStep::Request(request) = latest_roots_step(1, &[]).unwrap() else {
            panic!("expected a request first");
        };
        let LatestRootsStep::Roots(roots) = latest_roots_step(1, &[&reply]).unwrap() else {
            panic!("expected the roots after one reply");
        };

        assert_eq!(request.body, latest_roots_request(1).unwrap().body);
        assert_eq!(roots.certificates, CERTIFICATES_ROOT);
        assert!(latest_roots_step(1, &[&reply, &reply]).is_err());
    }

    #[test]
    fn aztec_network_takes_two_requests_to_its_node() {
        let block_number = json!([{ "jsonrpc": "2.0", "id": 0, "result": 7 }]).to_string();
        let word = |id: usize, value: &str| json!({ "jsonrpc": "2.0", "id": id, "result": value });
        let block = json!({ "header": { "globalVariables": { "timestamp": "5100" } } });
        let mut answers = vec![json!({ "jsonrpc": "2.0", "id": 0, "result": block })];
        for root in [CERTIFICATES_ROOT, CIRCUITS_ROOT, SANCTIONS_ROOT] {
            for value in ["0x0", "0x0", "0x0", root, "0x0"] {
                answers.push(word(answers.len(), value));
            }
        }
        let storage = Value::Array(answers).to_string();

        for (chain_id, node) in [
            (aztec_registry::AZTEC_CHAIN_ID, "https://aztec-mainnet.drpc.org"),
            (aztec_registry::AZTEC_TESTNET_CHAIN_ID, "https://aztec-testnet.drpc.org"),
        ] {
            let LatestRootsStep::Request(first) = latest_roots_step(chain_id, &[]).unwrap() else {
                panic!("expected a request first");
            };
            let LatestRootsStep::Request(second) =
                latest_roots_step(chain_id, &[&block_number]).unwrap()
            else {
                panic!("expected a second request");
            };
            let LatestRootsStep::Roots(roots) =
                latest_roots_step(chain_id, &[&block_number, &storage]).unwrap()
            else {
                panic!("expected the roots after two replies");
            };

            assert_eq!(first.url, node);
            assert!(first.body.contains("node_getBlockNumber"));
            assert_eq!(second.url, node);
            assert!(second.body.contains("node_getPublicStorageAt"));
            assert_eq!(roots.certificates, CERTIFICATES_ROOT);
            assert_eq!(roots.circuits, CIRCUITS_ROOT);
            assert_eq!(roots.sanctions, SANCTIONS_ROOT);
            assert!(latest_roots_step(chain_id, &[&block_number, &storage, &storage]).is_err());
        }
    }

    #[test]
    fn reads_each_root_by_its_registry_id() {
        let reply = json!([
            answer(3, SANCTIONS_ROOT),
            answer(1, CERTIFICATES_ROOT),
            answer(2, CIRCUITS_ROOT),
        ])
        .to_string();

        let roots = parse_latest_roots(&reply).unwrap();

        assert_eq!(roots.certificates, CERTIFICATES_ROOT);
        assert_eq!(roots.circuits, CIRCUITS_ROOT);
        assert_eq!(roots.sanctions, SANCTIONS_ROOT);
    }

    #[test]
    fn rejects_a_reply_without_three_usable_roots() {
        let zero_root = format!("0x{}", "0".repeat(64));
        let unusable_replies = [
            "<html>502 Bad Gateway</html>".to_string(),
            json!([answer(1, CERTIFICATES_ROOT), answer(3, SANCTIONS_ROOT)]).to_string(),
            json!([answer(1, CERTIFICATES_ROOT), answer(2, CIRCUITS_ROOT), answer(3, &zero_root)])
                .to_string(),
            json!([answer(1, CERTIFICATES_ROOT), answer(2, CIRCUITS_ROOT), answer(3, "0x1234")])
                .to_string(),
            json!([
                answer(1, CERTIFICATES_ROOT),
                answer(2, CIRCUITS_ROOT),
                { "jsonrpc": "2.0", "id": 3, "error": { "code": 3, "message": "execution reverted" } },
            ])
            .to_string(),
        ];

        for reply in unusable_replies {
            assert!(parse_latest_roots(&reply).is_err(), "{reply}");
        }
    }
}
