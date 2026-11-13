use aztec::protocol::traits::{Deserialize, Packable, Serialize};

// Root validation modes (RegistryConfig.mode), mirroring the L1 registry.
/// Only the current latest root is accepted.
pub global MODE_LATEST_ONLY: u8 = 0;

/// The latest and second to latest root are accepted.
pub global MODE_LATEST_AND_PREVIOUS: u8 = 1;

/// Any root whose [valid_from, valid_to] range contains the proof timestamp
/// (valid_to == 0 means open-ended).
pub global MODE_VALID_AT_TIMESTAMP: u8 = 2;

/// Like MODE_VALID_AT_TIMESTAMP, but a superseded root stays accepted for
/// RegistryConfig.window seconds past its valid_to; the latest root bypasses the
/// window check entirely. Deployment default (window 86400).
pub global MODE_VALID_WITHIN_WINDOW: u8 = 3;

pub global REGISTRY_CERTIFICATE: Field = 1;
pub global REGISTRY_CIRCUIT: Field = 2;
pub global REGISTRY_SANCTIONS: Field = 3;

pub global INITIAL_DELAY: u64 = 86400;

/// The app ids of ZKPassport's apps, hashed as the facematch circuits hash them: the bytes packed
/// little-endian into 31-byte fields, then Poseidon2.
pub global IOS_APP_ID_HASH: Field =
    0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b; // YL5MS3Z639.app.zkpassport.zkpassport
pub global IOS_APP_CLIP_APP_ID_HASH: Field =
    0x1409355f7733451c37093c8aac68611b102c0f270c9961d74ef6cfa6f888d3f0; // YL5MS3Z639.app.zkpassport.zkpassport.clip
pub global ANDROID_APP_ID_HASH: Field =
    0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615d; // app.zkpassport.zkpassport
pub global ZKPASSPORT_APP_ID_HASHES: [Field; 3] =
    [IOS_APP_ID_HASH, IOS_APP_CLIP_APP_ID_HASH, ANDROID_APP_ID_HASH];

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct RegistryConfig {
    pub mode: u8,
    pub window: u64,
}

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct LatestRootPair {
    pub latest: Field,
    pub previous: Field,
}

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct RootStatus {
    pub exists: bool,
    pub revoked: bool,
    pub valid_from: u64,
    pub valid_to: u64,
}
