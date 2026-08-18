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

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct RegistryConfig {
    pub mode: u8,
    pub window: u64,
}

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct LatestPair {
    pub latest: Field,
    pub previous: Field,
    pub count: u64,
}

#[derive(Deserialize, Eq, Packable, Serialize)]
pub struct RootStatus {
    pub exists: bool,
    pub revoked: bool,
    pub valid_from: u64,
    pub valid_to: u64,
}
