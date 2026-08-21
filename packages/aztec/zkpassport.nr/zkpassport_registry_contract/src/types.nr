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

/// Compile-time floor for the DPM delay (the preview value). The effective delay is a
/// per-deployment constructor param (`delay >= INITIAL_DELAY`); instances converge to it via
/// `ensure_delay`. Raises are effective immediately in aztec-nr, which is what lets one compiled
/// class serve both preview (1h) and production (24h) deployments.
pub global INITIAL_DELAY: u64 = 3600;

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
