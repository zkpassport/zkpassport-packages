use crate::types::{
    LatestPair, MODE_LATEST_AND_PREVIOUS, MODE_LATEST_ONLY, MODE_VALID_AT_TIMESTAMP,
    MODE_VALID_WITHIN_WINDOW, RegistryConfig, RootStatus,
};

pub fn is_root_valid(
    config: RegistryConfig,
    latest: LatestPair,
    status: RootStatus,
    root: Field,
    timestamp: u64,
) -> bool {
    if !status.exists {
        false // indexByRoot == 0 analog
    } else if config.mode == MODE_LATEST_ONLY {
        (latest.latest == root) & !status.revoked
    } else if config.mode == MODE_LATEST_AND_PREVIOUS {
        if latest.latest == root {
            !status.revoked
        } else {
            (latest.count >= 2) & (latest.previous == root) & !status.revoked
        }
    } else if config.mode == MODE_VALID_AT_TIMESTAMP {
        !status.revoked
            & (timestamp >= status.valid_from)
            & ((status.valid_to == 0) | (timestamp <= status.valid_to))
    } else if config.mode == MODE_VALID_WITHIN_WINDOW {
        if latest.latest == root {
            !status.revoked // latest bypasses the window entirely (deliberate L1 asymmetry)
        } else if status.revoked {
            false
        } else if timestamp < config.window {
            false // L1: unchecked underflow reverts; router try/catch → false
        } else {
            let window_start = timestamp - config.window;
            (status.valid_from <= timestamp)
                & ((status.valid_to == 0) | (status.valid_to >= window_start))
        }
    } else {
        false // defensive default, mirrors L1
    }
}

/// Mode-independent escape hatch (L1's RegistryHelper.isRootValidAtTimestamp).
pub fn is_root_valid_at_timestamp(status: RootStatus, timestamp: u64) -> bool {
    status.exists
        & !status.revoked
        & (timestamp >= status.valid_from)
        & ((status.valid_to == 0) | (timestamp <= status.valid_to))
}

// --- test helpers ---
fn cfg(mode: u8, window: u64) -> RegistryConfig {
    RegistryConfig { mode, window }
}
fn status(valid_from: u64, valid_to: u64) -> RootStatus {
    RootStatus { exists: true, revoked: false, valid_from, valid_to }
}
global R1: Field = 111;
global R2: Field = 222;
global R3: Field = 333;
fn latest_r2() -> LatestPair {
    LatestPair { latest: R2, previous: R1, count: 2 }
}

// --- LATEST_ONLY ---
#[test]
fn latest_only_accepts_latest() {
    assert(is_root_valid(cfg(MODE_LATEST_ONLY, 0), latest_r2(), status(100, 0), R2, 500));
}
#[test]
fn latest_only_rejects_previous() {
    assert(!is_root_valid(cfg(MODE_LATEST_ONLY, 0), latest_r2(), status(50, 99), R1, 500));
}
#[test]
fn latest_only_rejects_revoked_latest() {
    let mut s = status(100, 0);
    s.revoked = true;
    assert(!is_root_valid(cfg(MODE_LATEST_ONLY, 0), latest_r2(), s, R2, 500));
}

// --- LATEST_AND_PREVIOUS ---
#[test]
fn latest_and_previous_accepts_previous() {
    assert(is_root_valid(cfg(MODE_LATEST_AND_PREVIOUS, 0), latest_r2(), status(50, 99), R1, 500));
}
#[test]
fn latest_and_previous_rejects_previous_when_count_below_two() {
    let lp = LatestPair { latest: R2, previous: R1, count: 1 };
    assert(!is_root_valid(cfg(MODE_LATEST_AND_PREVIOUS, 0), lp, status(50, 99), R1, 500));
}
#[test]
fn latest_and_previous_rejects_older_root() {
    assert(!is_root_valid(cfg(MODE_LATEST_AND_PREVIOUS, 0), latest_r2(), status(10, 49), R3, 500));
}

// --- VALID_AT_TIMESTAMP ---
#[test]
fn at_timestamp_inside_interval() {
    assert(is_root_valid(cfg(MODE_VALID_AT_TIMESTAMP, 0), latest_r2(), status(100, 200), R1, 150));
}
#[test]
fn at_timestamp_before_valid_from() {
    assert(!is_root_valid(cfg(MODE_VALID_AT_TIMESTAMP, 0), latest_r2(), status(100, 200), R1, 99));
}
#[test]
fn at_timestamp_after_valid_to() {
    assert(!is_root_valid(cfg(MODE_VALID_AT_TIMESTAMP, 0), latest_r2(), status(100, 200), R1, 201));
}
#[test]
fn at_timestamp_sentinel_zero_is_open_ended() {
    assert(is_root_valid(cfg(MODE_VALID_AT_TIMESTAMP, 0), latest_r2(), status(100, 0), R2, 999999999));
}

// --- VALID_WITHIN_WINDOW (L1 test example: W=300, t0=1000) ---
#[test]
fn window_latest_bypasses_window_even_far_future() {
    assert(is_root_valid(cfg(MODE_VALID_WITHIN_WINDOW, 300), latest_r2(), status(1000, 0), R2, 99999999));
}
#[test]
fn window_revoked_latest_rejected() {
    let mut s = status(1000, 0);
    s.revoked = true;
    assert(!is_root_valid(cfg(MODE_VALID_WITHIN_WINDOW, 300), latest_r2(), s, R2, 1700));
}
#[test]
fn window_overlap_accepts() {
    // T=1700, W=300 → window [1400,1700]; validTo=1499 overlaps
    assert(is_root_valid(cfg(MODE_VALID_WITHIN_WINDOW, 300), latest_r2(), status(1000, 1499), R1, 1700));
}
#[test]
fn window_no_overlap_rejects() {
    // validTo=1199 < windowStart=1400
    assert(!is_root_valid(cfg(MODE_VALID_WITHIN_WINDOW, 300), latest_r2(), status(1000, 1199), R1, 1700));
}
#[test]
fn window_underflow_is_invalid_not_valid() {
    // L1: timestamp - window reverts → router catches → false. Saturating-sub would WRONGLY accept.
    assert(!is_root_valid(cfg(MODE_VALID_WITHIN_WINDOW, 300), latest_r2(), status(0, 10), R1, 100));
}
#[test]
fn window_valid_from_in_future_rejects() {
    assert(!is_root_valid(cfg(MODE_VALID_WITHIN_WINDOW, 300), latest_r2(), status(2000, 0), R1, 1700));
}

// --- cross-cutting ---
#[test]
fn nonexistent_root_always_invalid() {
    let s = RootStatus { exists: false, revoked: false, valid_from: 100, valid_to: 0 };
    assert(!is_root_valid(cfg(MODE_VALID_AT_TIMESTAMP, 0), latest_r2(), s, R1, 150));
}
#[test]
fn unknown_mode_always_invalid() {
    assert(!is_root_valid(cfg(4, 0), latest_r2(), status(100, 0), R2, 500));
}
#[test]
fn at_timestamp_helper_ignores_mode() {
    assert(is_root_valid_at_timestamp(status(100, 200), 150));
    assert(!is_root_valid_at_timestamp(status(100, 200), 201));
    let mut s = status(100, 200);
    s.revoked = true;
    assert(!is_root_valid_at_timestamp(s, 150));
}
