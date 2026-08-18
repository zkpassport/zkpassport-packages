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

    #[test]
    fn latest_only_mode() {
        let config = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        // the latest root is valid
        let latest = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, latest, ROOT_2, 500));

        // any other root is not, even the previous one
        let previous = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, previous, ROOT_1, 500));

        // a revoked latest root is not valid
        let revoked = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_2, 500));
    }

    #[test]
    fn latest_and_previous_mode() {
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        // both the latest and the previous root are valid
        let latest = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, latest, ROOT_2, 500));
        let previous = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(is_root_valid(config, latest_root_pair, previous, ROOT_1, 500));

        // an older root is not
        let older = RootStatus { exists: true, revoked: false, valid_from: 10, valid_to: 49 };
        assert(!is_root_valid(config, latest_root_pair, older, ROOT_3, 500));

        // a revoked previous root is not
        let revoked = RootStatus { exists: true, revoked: true, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_1, 500));

        // Single-root state: previous is the zeroed default. update_root rejects zero roots and
        // is_root_valid rejects non-existent ones, so previous == 0 can never match a real root.
        let single_root_pair = LatestRootPair { latest: ROOT_2, previous: 0 };
        assert(!is_root_valid(config, single_root_pair, previous, ROOT_1, 500));
    }

    #[test]
    fn valid_at_timestamp_mode() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        // valid inside [valid_from, valid_to], invalid outside
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_1, 150));
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 99));
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 201));

        // valid_to == 0 means open-ended
        let open_ended = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, open_ended, ROOT_2, 999999999));

        // a revoked root is invalid even inside its interval
        let revoked = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_1, 150));
    }

    #[test]
    fn valid_within_window_mode() {
        // L1 test example: W=300, t0=1000
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        // the latest root is valid arbitrarily far in the future, but not if revoked
        let latest = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, latest, ROOT_2, 99999999));
        let revoked_latest = RootStatus { exists: true, revoked: true, valid_from: 1000, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, revoked_latest, ROOT_2, 1700));

        // T=1700, W=300 → window [1400,1700]; validTo=1499 overlaps — but not if revoked
        let overlap = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1499 };
        assert(is_root_valid(config, latest_root_pair, overlap, ROOT_1, 1700));
        let revoked_overlap = RootStatus { exists: true, revoked: true, valid_from: 1000, valid_to: 1499 };
        assert(!is_root_valid(config, latest_root_pair, revoked_overlap, ROOT_1, 1700));

        // validTo=1199 < windowStart=1400 → no overlap
        let no_overlap = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1199 };
        assert(!is_root_valid(config, latest_root_pair, no_overlap, ROOT_1, 1700));

        // timestamp < window: L1's unchecked timestamp - window reverts and the router catches it
        // as invalid. Saturating subtraction would WRONGLY accept here.
        let underflow = RootStatus { exists: true, revoked: false, valid_from: 0, valid_to: 10 };
        assert(!is_root_valid(config, latest_root_pair, underflow, ROOT_1, 100));

        // valid_from in the future
        let future = RootStatus { exists: true, revoked: false, valid_from: 2000, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, future, ROOT_1, 1700));
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
    fn is_root_valid_at_timestamp_helper() {
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(is_root_valid_at_timestamp(status, 150));
        assert(!is_root_valid_at_timestamp(status, 201));
        let revoked = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid_at_timestamp(revoked, 150));
    }
}
