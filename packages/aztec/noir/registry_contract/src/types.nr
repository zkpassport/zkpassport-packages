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
/// The roots of the Android attestation revocation tree, the revoked attestation keys' serials.
pub global REGISTRY_ATTESTATION_REVOCATION: Field = 4;

/// The root of the attestation revocation tree with no revoked serials, as `AppAttest` in the L1
/// verifier's lib/Constants.sol has it. An Android face match may commit it only while the
/// attestation revocation registry has no root.
pub global EMPTY_REVOCATION_ROOT: Field =
    0x23157e6435e936c4698498358363acb2a9a811908c4806e1087677338e1c5525;

pub global INITIAL_DELAY: u64 = 86400;

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
