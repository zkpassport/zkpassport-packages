use aztec::protocol::traits::{Deserialize, Packable, Serialize};

pub global MODE_LATEST_ONLY: u8 = 0;
pub global MODE_LATEST_AND_PREVIOUS: u8 = 1;
pub global MODE_VALID_AT_TIMESTAMP: u8 = 2;
pub global MODE_VALID_WITHIN_WINDOW: u8 = 3;

pub global REGISTRY_CERTIFICATE: Field = 1;
pub global REGISTRY_CIRCUIT: Field = 2;
pub global REGISTRY_SANCTIONS: Field = 3;

pub global INITIAL_DELAY: u64 = 86400;
pub global MAX_BATCH_SIZE: u32 = 8;

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

// Calldata form for batch updates (L1's RootInput minus leaves/cid/metadata — spec decision #9)
#[derive(Deserialize, Eq, Serialize)]
pub struct RootInput {
    pub root: Field,
    pub valid_from: u64,
    pub valid_to: u64,
    pub revoked: bool,
}
