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
    fn latest_only_mode_accepts_only_the_latest_root() {
        let config = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let latest = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, latest, ROOT_2, 500));

        let previous = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, previous, ROOT_1, 500));
    }

    #[test]
    fn latest_only_mode_rejects_revoked_latest() {
        let config = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let unrevoked = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, unrevoked, ROOT_2, 500));

        let revoked = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_2, 500));
    }

    #[test]
    fn latest_and_previous_mode_accepts_latest_and_previous() {
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let latest = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, latest, ROOT_2, 500));

        let previous = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(is_root_valid(config, latest_root_pair, previous, ROOT_1, 500));

        let older = RootStatus { exists: true, revoked: false, valid_from: 10, valid_to: 49 };
        assert(!is_root_valid(config, latest_root_pair, older, ROOT_3, 500));
    }

    #[test]
    fn latest_and_previous_mode_rejects_revoked_previous() {
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let unrevoked = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(is_root_valid(config, latest_root_pair, unrevoked, ROOT_1, 500));

        let revoked = RootStatus { exists: true, revoked: true, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_1, 500));
    }

    #[test]
    fn latest_and_previous_mode_rejects_non_latest_when_no_previous_exists() {
        // Single-root state: previous is the zeroed default. update_root rejects zero roots and
        // is_root_valid rejects non-existent ones, so previous == 0 can never match a real root.
        let config = RegistryConfig { mode: MODE_LATEST_AND_PREVIOUS, window: 0 };
        let single_root_pair = LatestRootPair { latest: ROOT_2, previous: 0 };

        let latest = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, single_root_pair, latest, ROOT_2, 500));

        let other = RootStatus { exists: true, revoked: false, valid_from: 50, valid_to: 99 };
        assert(!is_root_valid(config, single_root_pair, other, ROOT_1, 500));
    }

    #[test]
    fn valid_at_timestamp_mode_accepts_within_interval() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(is_root_valid(config, latest_root_pair, status, ROOT_1, 150));
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 99));
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 201));
    }

    #[test]
    fn valid_at_timestamp_mode_treats_zero_valid_to_as_open_ended() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let open_ended = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, open_ended, ROOT_2, 999999999));

        let closed = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid(config, latest_root_pair, closed, ROOT_2, 999999999));
    }

    #[test]
    fn valid_at_timestamp_mode_rejects_revoked() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let unrevoked = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 200 };
        assert(is_root_valid(config, latest_root_pair, unrevoked, ROOT_1, 150));

        let revoked = RootStatus { exists: true, revoked: true, valid_from: 100, valid_to: 200 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_1, 150));
    }

    #[test]
    fn valid_within_window_mode_latest_is_always_valid() {
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let latest = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, latest, ROOT_2, 99999999));

        // a superseded root long past its window is not
        let superseded = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1499 };
        assert(!is_root_valid(config, latest_root_pair, superseded, ROOT_1, 99999999));
    }

    #[test]
    fn valid_within_window_mode_accepts_superseded_roots_within_window() {
        // T=1700, W=300 → window [1400,1700]
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        // validTo=1499 overlaps the window
        let overlap = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1499 };
        assert(is_root_valid(config, latest_root_pair, overlap, ROOT_1, 1700));

        // validTo=1199 < windowStart=1400
        let no_overlap = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1199 };
        assert(!is_root_valid(config, latest_root_pair, no_overlap, ROOT_1, 1700));
    }

    #[test]
    fn valid_within_window_mode_rejects_revoked() {
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let unrevoked = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 1499 };
        assert(is_root_valid(config, latest_root_pair, unrevoked, ROOT_1, 1700));

        let revoked = RootStatus { exists: true, revoked: true, valid_from: 1000, valid_to: 1499 };
        assert(!is_root_valid(config, latest_root_pair, revoked, ROOT_1, 1700));

        let revoked_latest = RootStatus { exists: true, revoked: true, valid_from: 1000, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, revoked_latest, ROOT_2, 1700));
    }

    #[test]
    fn valid_within_window_mode_rejects_timestamps_below_the_window() {
        // L1's unchecked timestamp - window reverts there and the router catches it as invalid.
        // Saturating subtraction would WRONGLY accept.
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let status = RootStatus { exists: true, revoked: false, valid_from: 0, valid_to: 10 };
        assert(!is_root_valid(config, latest_root_pair, status, ROOT_1, 100));

        // the same root is accepted once the timestamp clears the window (windowStart=5 ≤ validTo=10)
        assert(is_root_valid(config, latest_root_pair, status, ROOT_1, 305));
    }

    #[test]
    fn valid_within_window_mode_rejects_future_valid_from() {
        let config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 300 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let started = RootStatus { exists: true, revoked: false, valid_from: 1000, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, started, ROOT_1, 1700));

        let future = RootStatus { exists: true, revoked: false, valid_from: 2000, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, future, ROOT_1, 1700));
    }

    #[test]
    fn nonexistent_root_always_invalid() {
        let config = RegistryConfig { mode: MODE_VALID_AT_TIMESTAMP, window: 0 };
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };

        let existing = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };
        assert(is_root_valid(config, latest_root_pair, existing, ROOT_1, 150));

        let nonexistent = RootStatus { exists: false, revoked: false, valid_from: 100, valid_to: 0 };
        assert(!is_root_valid(config, latest_root_pair, nonexistent, ROOT_1, 150));
    }

    #[test]
    fn unknown_mode_always_invalid() {
        let latest_root_pair = LatestRootPair { latest: ROOT_2, previous: ROOT_1 };
        let status = RootStatus { exists: true, revoked: false, valid_from: 100, valid_to: 0 };

        let known = RegistryConfig { mode: MODE_LATEST_ONLY, window: 0 };
        assert(is_root_valid(known, latest_root_pair, status, ROOT_2, 500));

        let unknown = RegistryConfig { mode: 4, window: 0 };
        assert(!is_root_valid(unknown, latest_root_pair, status, ROOT_2, 500));
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
