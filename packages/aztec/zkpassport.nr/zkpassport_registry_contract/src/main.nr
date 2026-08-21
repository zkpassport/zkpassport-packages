pub mod types;
mod root_validation;
mod guards;

use aztec::macros::aztec;

#[aztec]
pub contract ZKPassportRegistry {
    use crate::guards::{
        assert_admin_not_zero, assert_admin_or_oracle, assert_oracle_not_zero,
        assert_valid_registry_id, ensure_delay,
    };
    use crate::root_validation::{is_root_valid, is_root_valid_at_timestamp};
    use crate::types::{
        INITIAL_DELAY, LatestRootPair, REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT, REGISTRY_SANCTIONS,
        RegistryConfig, RootStatus,
    };
    use aztec::{
        macros::{functions::{external, initializer, view}, storage::storage},
        protocol::address::AztecAddress,
        state_vars::{DelayedPublicMutable, Map, PublicImmutable, PublicMutable},
    };

    #[storage]
    struct Storage<Context> {
        // Contract roles are set and used in public
        admin: PublicMutable<AztecAddress, Context>,
        oracle: PublicMutable<AztecAddress, Context>,
        guardian: PublicMutable<AztecAddress, Context>,

        // The effective DPM delay for this deployment (e.g. 86400 on real networks, 3600 for
        // previews), pinned at construction. INITIAL_DELAY is only the compile-time floor; DPM
        // instances converge to `delay` in the constructor or on their first write (ensure_delay).
        delay: PublicImmutable<u64, Context>,

        // Everything below is read privately by verifiers thus using DelayedPublicMutable and
        // subject to the deployment's `delay`.
        // INVARIANT: fresh map keys sit at the INITIAL_DELAY floor until first written, so every
        // DPM's zeroed default must be one that REJECTS proofs (exists=false, accepted=false,
        // latest=0). A field whose default is permissive — like `paused`, where false allows
        // proofs — must be top-level and raised in the constructor, never map-keyed.
        paused: DelayedPublicMutable<bool, INITIAL_DELAY, Context>,
        config: Map<Field, DelayedPublicMutable<RegistryConfig, INITIAL_DELAY, Context>, Context>,
        latest: Map<Field, DelayedPublicMutable<LatestRootPair, INITIAL_DELAY, Context>, Context>,
        roots: Map<
            Field,
            Map<Field, DelayedPublicMutable<RootStatus, INITIAL_DELAY, Context>, Context>,
            Context,
        >,
        accepted_vks: Map<Field, DelayedPublicMutable<bool, INITIAL_DELAY, Context>, Context>,
        oprf_pk_hash: DelayedPublicMutable<Field, INITIAL_DELAY, Context>,
    }

    // `admin`, `oracle`, and `guardian` are contract roles.
    // `mode` and `window` specify the root verification behavior of this registry. For a list of valid modes, refer to
    // types.nr. `window` is a duration in seconds used in the `MODE_VALID_WITHIN_WINDOW` mode.
    // `delay` is the effective DPM delay for this deployment; it may only raise the compiled-in
    // INITIAL_DELAY floor (raises are immediate in aztec-nr, decreases would take current-new to
    // mature and are rejected instead).
    #[external("public")]
    #[initializer]
    fn constructor(
        admin: AztecAddress,
        oracle: AztecAddress,
        guardian: AztecAddress,
        mode: u8,
        window: u64,
        delay: u64,
    ) {
        assert(mode <= 3, "unknown validation mode");
        assert(delay >= INITIAL_DELAY, "delay below minimum");
        self.storage.admin.write(admin);
        self.storage.oracle.write(oracle);
        self.storage.guardian.write(guardian);
        self.storage.delay.initialize(delay);

        // Raise every DPM instance reachable at construction: the top-level ones (`paused` must
        // never sit at the floor — its zeroed default is the permissive value) and the three fixed
        // config keys. `latest` (same three keys) is deliberately left to update_root's
        // ensure_delay: raising it here too would push the constructor over the AVM's per-tx
        // storage-write cap, and until the first update_root its default {0, 0} matches no root.
        ensure_delay(self.storage.paused, delay);
        ensure_delay(self.storage.oprf_pk_hash, delay);
        for id in [REGISTRY_CERTIFICATE, REGISTRY_CIRCUIT, REGISTRY_SANCTIONS] {
            ensure_delay(self.storage.config.at(id), delay);
        }

        // Note: until `delay` elapses the config DPMs read their zeroed default
        // {mode: 0 = LATEST_ONLY, window: 0}, which is safe — no roots exist yet, so everything
        // is invalid either way.
        let config = RegistryConfig { mode, window };
        self.storage.config.at(REGISTRY_CERTIFICATE).schedule_value_change(config);
        self.storage.config.at(REGISTRY_CIRCUIT).schedule_value_change(config);
        self.storage.config.at(REGISTRY_SANCTIONS).schedule_value_change(config);
    }

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

    #[external("public")]
    fn pause() {
        let sender = self.msg_sender();
        let is_admin = sender == self.storage.admin.read();
        let is_guardian = sender == self.storage.guardian.read();
        assert(is_admin | is_guardian, "caller is not admin or guardian");
        ensure_delay(self.storage.paused, self.storage.delay.read());
        self.storage.paused.schedule_value_change(true);
    }

    #[external("public")]
    fn unpause() {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        ensure_delay(self.storage.paused, self.storage.delay.read());
        self.storage.paused.schedule_value_change(false);
    }

    #[external("public")]
    fn update_root(registry_id: Field, new_root: Field, current_root: Field, timestamp: u64) {
        assert(self.msg_sender() == self.storage.oracle.read(), "caller is not oracle");

        let (pending_paused, _) = self.storage.paused.get_scheduled_value();
        assert(!pending_paused, "registry is paused");

        assert_valid_registry_id(registry_id);

        assert(new_root != 0, "new root cannot be zero");

        let new_slot = self.storage.roots.at(registry_id).at(new_root);
        let (new_status, _) = new_slot.get_scheduled_value();
        assert(!new_status.exists, "root already exists");

        let latest_slot = self.storage.latest.at(registry_id);
        let (cur, _) = latest_slot.get_scheduled_value();
        assert(cur.latest == current_root, "current root mismatch"); // avoid races in oracle executions

        let delay = self.storage.delay.read();
        if cur.latest != 0 {
            let old_slot = self.storage.roots.at(registry_id).at(cur.latest);
            let (old, _) = old_slot.get_scheduled_value();
            assert(timestamp > old.valid_from, "timestamp not after current valid_from");
            ensure_delay(old_slot, delay);
            old_slot.schedule_value_change(RootStatus {
                exists: old.exists,
                revoked: old.revoked,
                valid_from: old.valid_from,
                valid_to: timestamp - 1, // close the interval
            });
        }
        ensure_delay(new_slot, delay);
        new_slot.schedule_value_change(RootStatus {
            exists: true,
            revoked: false,
            valid_from: timestamp,
            valid_to: 0, // open-ended sentinel: "currently latest"
        });
        ensure_delay(latest_slot, delay);
        latest_slot.schedule_value_change(LatestRootPair { latest: new_root, previous: cur.latest });
    }

    #[external("public")]
    fn set_revocation_status(registry_id: Field, root: Field, revoked: bool) {
        assert_admin_or_oracle(self.msg_sender(), self.storage.admin.read(), self.storage.oracle.read());
        assert_valid_registry_id(registry_id);
        let slot = self.storage.roots.at(registry_id).at(root);
        let (status, _) = slot.get_scheduled_value();
        assert(status.exists, "root does not exist");
        ensure_delay(slot, self.storage.delay.read());
        slot.schedule_value_change(RootStatus {
            exists: status.exists,
            revoked,
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
        ensure_delay(slot, self.storage.delay.read());
        slot.schedule_value_change(RegistryConfig { mode, window: cfg.window });
    }

    #[external("public")]
    fn set_validity_window(registry_id: Field, window: u64) {
        assert_admin_or_oracle(self.msg_sender(), self.storage.admin.read(), self.storage.oracle.read());
        assert_valid_registry_id(registry_id);
        let slot = self.storage.config.at(registry_id);
        let (cfg, _) = slot.get_scheduled_value();
        ensure_delay(slot, self.storage.delay.read());
        slot.schedule_value_change(RegistryConfig { mode: cfg.mode, window });
    }

    #[external("public")]
    fn add_accepted_vk(vk_hash: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        assert(vk_hash != 0, "vk hash cannot be zero");
        ensure_delay(self.storage.accepted_vks.at(vk_hash), self.storage.delay.read());
        self.storage.accepted_vks.at(vk_hash).schedule_value_change(true);
    }

    #[external("public")]
    fn remove_accepted_vk(vk_hash: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        ensure_delay(self.storage.accepted_vks.at(vk_hash), self.storage.delay.read());
        self.storage.accepted_vks.at(vk_hash).schedule_value_change(false);
    }

    #[external("public")]
    fn set_oprf_pk_hash(oprf_pk_hash: Field) {
        assert(self.msg_sender() == self.storage.admin.read(), "caller is not admin");
        ensure_delay(self.storage.oprf_pk_hash, self.storage.delay.read());
        self.storage.oprf_pk_hash.schedule_value_change(oprf_pk_hash);
    }

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

        // nullifier types: SALTED = 1, SALTED_MOCK = 3 -> verify OPRF pubkey matches
        if (nullifier_type == 1) | (nullifier_type == 3) {
            let stored = self.storage.oprf_pk_hash.get_current_value();
            assert(stored != 0, "oprf pk hash not set");
            assert(oprf_pk_hash == stored, "oprf pk hash mismatch");
        }
    }

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

    // Mode-independent root validation. Only takes into account timestamp falls in root validity period,
    // and non-revocation.
    #[external("private")]
    #[view]
    fn assert_root_valid_at_timestamp(registry_id: Field, root: Field, timestamp: u64) {
        assert(!self.storage.paused.get_current_value(), "registry is paused");
        assert_valid_registry_id(registry_id);
        let status = self.storage.roots.at(registry_id).at(root).get_current_value();
        assert(is_root_valid_at_timestamp(status, timestamp), "root not valid at timestamp");
    }

    // ---- test-only views. Observe the DPM's *current* (delay-applied) values ----
    #[external("utility")]
    unconstrained fn get_latest_pair(registry_id: Field) -> pub LatestRootPair {
        self.storage.latest.at(registry_id).get_current_value()
    }

    #[external("utility")]
    unconstrained fn is_vk_accepted(vk_hash: Field) -> pub bool {
        self.storage.accepted_vks.at(vk_hash).get_current_value()
    }

    #[external("utility")]
    unconstrained fn get_root_status(registry_id: Field, root: Field) -> pub RootStatus {
        self.storage.roots.at(registry_id).at(root).get_current_value()
    }
}
