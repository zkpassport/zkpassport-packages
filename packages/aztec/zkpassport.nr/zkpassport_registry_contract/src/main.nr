pub mod types;
mod root_validation;
mod guards;

use aztec::macros::aztec;

#[aztec]
pub contract ZKPassportRegistry {
    use crate::guards::{
        assert_admin_not_zero, assert_admin_or_oracle, assert_oracle_not_zero,
        assert_valid_registry_id,
    };
    use crate::root_validation::{is_root_valid, is_root_valid_at_timestamp};
    use crate::types::{
        INITIAL_DELAY, LatestPair, MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE,
        REGISTRY_CIRCUIT, REGISTRY_SANCTIONS, RegistryConfig, RootStatus,
    };
    use aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::{DelayedPublicMutable, Map, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        // Roles: only ever read in public write functions → plain public state (instant)
        admin: PublicMutable<AztecAddress, Context>,
        oracle: PublicMutable<AztecAddress, Context>,
        guardian: PublicMutable<AztecAddress, Context>,
        // Everything below is read privately by verifiers → DPM, 24h delay.
        // Write-path guards read the *scheduled* value via get_scheduled_value() (no mirrors needed).
        paused: DelayedPublicMutable<bool, INITIAL_DELAY, Context>,
        config: Map<Field, DelayedPublicMutable<RegistryConfig, INITIAL_DELAY, Context>, Context>,
        latest: Map<Field, DelayedPublicMutable<LatestPair, INITIAL_DELAY, Context>, Context>,
        roots: Map<
            Field,
            Map<Field, DelayedPublicMutable<RootStatus, INITIAL_DELAY, Context>, Context>,
            Context,
        >,
        accepted_vks: Map<Field, DelayedPublicMutable<bool, INITIAL_DELAY, Context>, Context>,
        oprf_pk_hash: DelayedPublicMutable<Field, INITIAL_DELAY, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress, oracle: AztecAddress, guardian: AztecAddress) {
        self.storage.admin.write(admin);
        self.storage.oracle.write(oracle);
        self.storage.guardian.write(guardian);
        // L1 production defaults: VALID_WITHIN_WINDOW, 24h window, for all three registries.
        // Note: for the first 24h the DPM reads its zeroed default {mode: 0 = LATEST_ONLY, window: 0},
        // which is safe — no roots exist yet, so everything is invalid either way.
        let default_config = RegistryConfig { mode: MODE_VALID_WITHIN_WINDOW, window: 86400 };
        self.storage.config.at(REGISTRY_CERTIFICATE).schedule_value_change(default_config);
        self.storage.config.at(REGISTRY_CIRCUIT).schedule_value_change(default_config);
        self.storage.config.at(REGISTRY_SANCTIONS).schedule_value_change(default_config);
    }

    // ---- roles (mirror L1 RegistryInstance) ----

    #[external("public")]
    fn transfer_admin(new_admin: AztecAddress) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        assert_admin_not_zero(new_admin);
        self.storage.admin.write(new_admin);
    }

    #[external("public")]
    fn set_oracle(new_oracle: AztecAddress) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        assert_oracle_not_zero(new_oracle);
        self.storage.oracle.write(new_oracle);
    }

    #[external("public")]
    fn set_guardian(new_guardian: AztecAddress) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        self.storage.guardian.write(new_guardian);
    }

    // Guardian can pause; only admin can unpause (L1 parity). Both bite after 24h (spec decision #1).
    #[external("public")]
    fn pause() {
        let sender = self.msg_sender();
        let is_admin = sender == self.storage.admin.read();
        let is_guardian = sender == self.storage.guardian.read();
        assert(is_admin | is_guardian, "caller is not admin or guardian");
        self.storage.paused.schedule_value_change(true);
    }

    #[external("public")]
    fn unpause() {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        self.storage.paused.schedule_value_change(false);
    }

    // ---- root updates (oracle) ----

    #[external("public")]
    fn update_root(registry_id: Field, new_root: Field, current_root: Field, timestamp: u64) {
        assert(self.msg_sender() == self.storage.oracle.read(), "caller is not oracle");
        let (pending_paused, _) = self.storage.paused.get_scheduled_value();
        assert(!pending_paused, "registry is paused");
        assert_valid_registry_id(registry_id);
        assert(new_root != 0, "new root cannot be zero");

        let new_slot = self.storage.roots.at(registry_id).at(new_root);
        let (new_status, _) = new_slot.get_scheduled_value();
        assert(!new_status.exists, "root already exists"); // roots can NEVER be re-inserted

        let latest_slot = self.storage.latest.at(registry_id);
        let (cur, _) = latest_slot.get_scheduled_value();
        assert(cur.latest == current_root, "current root mismatch"); // CAS guard; 0 for first update

        if cur.latest != 0 {
            let old_slot = self.storage.roots.at(registry_id).at(cur.latest);
            let (old, _) = old_slot.get_scheduled_value();
            assert(timestamp > old.valid_from, "timestamp not after current validFrom");
            old_slot.schedule_value_change(RootStatus {
                exists: old.exists,
                revoked: old.revoked,
                valid_from: old.valid_from,
                valid_to: timestamp - 1, // close the interval
            });
        }
        new_slot.schedule_value_change(RootStatus {
            exists: true,
            revoked: false,
            valid_from: timestamp,
            valid_to: 0, // open-ended sentinel: "currently latest"
        });
        latest_slot.schedule_value_change(LatestPair {
            latest: new_root,
            previous: cur.latest,
            count: cur.count + 1,
        });
    }

    // ---- policy knobs (admin or oracle) ----

    #[external("public")]
    fn set_revocation_status(registry_id: Field, root: Field, revoked: bool) {
        assert_admin_or_oracle(self.msg_sender(), self.storage.admin.read(), self.storage.oracle.read());
        assert_valid_registry_id(registry_id);
        let slot = self.storage.roots.at(registry_id).at(root);
        let (status, _) = slot.get_scheduled_value();
        assert(status.exists, "root does not exist");
        slot.schedule_value_change(RootStatus {
            exists: status.exists,
            revoked, // reversible (L1 parity)
            valid_from: status.valid_from,
            valid_to: status.valid_to,
        });
    }

    #[external("public")]
    fn set_root_validation_mode(registry_id: Field, mode: u8) {
        assert_admin_or_oracle(self.msg_sender(), self.storage.admin.read(), self.storage.oracle.read());
        assert_valid_registry_id(registry_id);
        assert(mode <= 3, "unknown validation mode");
        let slot = self.storage.config.at(registry_id);
        let (cfg, _) = slot.get_scheduled_value();
        slot.schedule_value_change(RegistryConfig { mode, window: cfg.window });
    }

    #[external("public")]
    fn set_validity_window(registry_id: Field, window: u64) {
        assert_admin_or_oracle(self.msg_sender(), self.storage.admin.read(), self.storage.oracle.read());
        assert_valid_registry_id(registry_id);
        let slot = self.storage.config.at(registry_id);
        let (cfg, _) = slot.get_scheduled_value();
        slot.schedule_value_change(RegistryConfig { mode: cfg.mode, window });
    }

    // ---- accepted VK and OPRF pubkey hash management (admin) ----

    #[external("public")]
    fn add_accepted_vk(vk_hash: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        assert(vk_hash != 0, "vk hash cannot be zero");
        self.storage.accepted_vks.at(vk_hash).schedule_value_change(true);
    }

    #[external("public")]
    fn remove_accepted_vk(vk_hash: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        self.storage.accepted_vks.at(vk_hash).schedule_value_change(false);
    }

    #[external("public")]
    fn set_oprf_pk_hash(oprf_pk_hash: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        self.storage.oprf_pk_hash.schedule_value_change(oprf_pk_hash);
    }

    // ---- private views (the verify path) ----

    #[external("private")]
    #[view]
    fn assert_proof_valid(
        vk_hash: Field,
        cert_root: Field,
        circuit_root: Field,
        current_date: u64,
        nullifier_type: u8,
        oprf_pk_hash: Field,
    ) {
        assert(!self.storage.paused.get_current_value(), "registry is paused");
        assert(self.storage.accepted_vks.at(vk_hash).get_current_value(), "vk not accepted");

        let cert_cfg = self.storage.config.at(REGISTRY_CERTIFICATE).get_current_value();
        let cert_latest = self.storage.latest.at(REGISTRY_CERTIFICATE).get_current_value();
        let cert_status =
            self.storage.roots.at(REGISTRY_CERTIFICATE).at(cert_root).get_current_value();
        assert(
            is_root_valid(cert_cfg, cert_latest, cert_status, cert_root, current_date),
            "invalid certificate registry root",
        );

        let circ_cfg = self.storage.config.at(REGISTRY_CIRCUIT).get_current_value();
        let circ_latest = self.storage.latest.at(REGISTRY_CIRCUIT).get_current_value();
        let circ_status =
            self.storage.roots.at(REGISTRY_CIRCUIT).at(circuit_root).get_current_value();
        assert(
            is_root_valid(circ_cfg, circ_latest, circ_status, circuit_root, current_date),
            "invalid circuit registry root",
        );

        // L1 SubVerifier step 9: OPRF pubkey binding for SALTED nullifier types only.
        // nullifier types: SALTED = 1, SALTED_MOCK = 3
        if (nullifier_type == 1) | (nullifier_type == 3) {
            let stored = self.storage.oprf_pk_hash.get_current_value();
            assert(stored != 0, "oprf pk hash not set");
            assert(oprf_pk_hash == stored, "oprf pk hash mismatch");
        }
    }

    // Opt-in sanctions lane (L1's VerifierHelper split — spec decision #4)
    #[external("private")]
    #[view]
    fn assert_sanctions_root_valid(root: Field, current_date: u64) {
        assert(!self.storage.paused.get_current_value(), "registry is paused");
        let cfg = self.storage.config.at(REGISTRY_SANCTIONS).get_current_value();
        let latest = self.storage.latest.at(REGISTRY_SANCTIONS).get_current_value();
        let status = self.storage.roots.at(REGISTRY_SANCTIONS).at(root).get_current_value();
        assert(
            is_root_valid(cfg, latest, status, root, current_date),
            "invalid sanctions registry root",
        );
    }

    // Mode-independent escape hatch (L1 RegistryHelper.isRootValidAtTimestamp)
    #[external("private")]
    #[view]
    fn assert_root_valid_at_timestamp(registry_id: Field, root: Field, timestamp: u64) {
        assert(!self.storage.paused.get_current_value(), "registry is paused");
        assert_valid_registry_id(registry_id);
        let status = self.storage.roots.at(registry_id).at(root).get_current_value();
        assert(is_root_valid_at_timestamp(status, timestamp), "root not valid at timestamp");
    }

    // ---- test-only views (Task 4+5): observe the DPM's *current* (delay-applied) values ----

    #[external("utility")]
    unconstrained fn get_latest_pair(registry_id: Field) -> pub LatestPair {
        self.storage.latest.at(registry_id).get_current_value()
    }

    #[external("utility")]
    unconstrained fn is_vk_accepted(vk_hash: Field) -> pub bool {
        self.storage.accepted_vks.at(vk_hash).get_current_value()
    }
}
