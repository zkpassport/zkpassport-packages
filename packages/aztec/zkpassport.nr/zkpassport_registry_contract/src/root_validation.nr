use crate::types::{
    LatestRootPair, MODE_LATEST_AND_PREVIOUS, MODE_LATEST_ONLY, MODE_VALID_AT_TIMESTAMP,
    MODE_VALID_WITHIN_WINDOW, RegistryConfig, RootStatus,
};

pub fn is_root_valid(
    config: RegistryConfig,
    latest_root_pair: LatestRootPair,
    status: RootStatus,
    root: Field,
    timestamp: u64,
) -> bool {
    if !status.exists | status.revoked {
        false
    } else if config.mode == MODE_LATEST_ONLY {
        latest_root_pair.latest == root
    } else if config.mode == MODE_LATEST_AND_PREVIOUS {
        (latest_root_pair.latest == root) | (latest_root_pair.previous == root)
    } else if config.mode == MODE_VALID_AT_TIMESTAMP {
        (timestamp >= status.valid_from)
            & ((status.valid_to == 0) | (timestamp <= status.valid_to))
    } else if config.mode == MODE_VALID_WITHIN_WINDOW {
        if latest_root_pair.latest == root {
            true // latest is valid in this mode
        } else if timestamp < config.window {
            false
        } else {
            let window_start = timestamp - config.window;
            (status.valid_from <= timestamp)
                & ((status.valid_to == 0) | (status.valid_to >= window_start))
        }
    } else {
        false
    }
}

/// Evaluates root validity only based on existence, revocation status, and validity timestamps
pub fn is_root_valid_at_timestamp(status: RootStatus, timestamp: u64) -> bool {
    status.exists
        & !status.revoked
        & (timestamp >= status.valid_from)
        & ((status.valid_to == 0) | (timestamp <= status.valid_to))
}

mod test {
    use super::{is_root_valid, is_root_valid_at_timestamp};
    use crate::types::{
        LatestRootPair, MODE_LATEST_AND_PREVIOUS, MODE_LATEST_ONLY, MODE_VALID_AT_TIMESTAMP,
        MODE_VALID_WITHIN_WINDOW, RegistryConfig, RootStatus,
    };

    global ROOT_1: Field = 111;
    global ROOT_2: Field = 222;
    global ROOT_3: Field = 333;

    // --- LATEST_ONLY ---
    #[test]
    fn latest_only_accepts_latest() {
        let config = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_2, 500));
    }
    #[test]
    fn latest_only_rejects_previous() {
        let config = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 500));
    }
    #[test]
    fn latest_only_rejects_revoked_latest() {
        let config = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_2, 500));
    }

    // --- LATEST_AND_PREVIOUS ---
    #[test]
    fn latest_and_previous_accepts_previous() {
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_1, 500));
    }
    #[test]
    fn latest_and_previous_rejects_non_latest_when_no_previous_exists() {
        // Single-root state: previous is the zeroed default. update_root rejects zero roots and
        // is_root_valid rejects non-existent ones, so previous == 0 can never match a real root.
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: 0 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 500));
    }
    #[test]
    fn latest_and_previous_rejects_older_root() {
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 10, valid_to: 49 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_3, 500));
    }
    #[test]
    fn latest_and_previous_rejects_revoked_previous() {
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: true, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 500));
    }

    // --- VALID_AT_TIMESTAMP ---
    #[test]
    fn at_timestamp_inside_interval() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_1, 150));
    }
    #[test]
    fn at_timestamp_before_valid_from() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 99));
    }
    #[test]
    fn at_timestamp_after_valid_to() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 201));
    }
    #[test]
    fn at_timestamp_sentinel_zero_is_open_ended() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_2, 999999999));
    }
    #[test]
    fn at_timestamp_rejects_revoked_inside_interval() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 150));
    }

    // --- VALID_WITHIN_WINDOW (L1 test example: W=300, t0=1000) ---
    #[test]
    fn window_latest_bypasses_window_even_far_future() {
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_2, 99999999));
    }
    #[test]
    fn window_revoked_latest_rejected() {
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: true, valid_from: 1000, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_2, 1700));
    }
    #[test]
    fn window_overlap_accepts() {
        // T=1700, W=300 → window [1400,1700]; validTo=1499 overlaps
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1499 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_1, 1700));
    }
    #[test]
    fn window_revoked_non_latest_rejected_despite_overlap() {
        // Same geometry as window_overlap_accepts, but revoked
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: true, valid_from: 1000, valid_to: 1499 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 1700));
    }
    #[test]
    fn window_no_overlap_rejects() {
        // validTo=1199 < windowStart=1400
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1199 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 1700));
    }
    #[test]
    fn window_underflow_is_invalid_not_valid() {
        // L1: timestamp - window reverts → router catches → false. Saturating-sub would WRONGLY accept.
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 0, valid_to: 10 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 100));
    }
    #[test]
    fn window_valid_from_in_future_rejects() {
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 2000, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 1700));
    }

    // --- cross-cutting ---
    #[test]
    fn nonexistent_root_always_invalid() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: false, revoked: false, valid_from: 100, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 150));
    }
    #[test]
    fn unknown_mode_always_invalid() {
        let config = RegistryConfig { mode: 4, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_2, 500));
    }
    #[test]
    fn at_timestamp_helper_ignores_mode() {
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(is_root_valid_at_timestamp(status, 150));
        assert(!is_root_valid_at_timestamp(status, 201));
        let revoked = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid_at_timestamp(revoked, 150));
    }
}
