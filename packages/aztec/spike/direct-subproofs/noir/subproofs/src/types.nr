//! The subproof shapes of circuits 0.23.0's `outer_lib`, and the values the outer circuit takes as
//! public inputs. `key_hash` is not carried: it is poseidon2(vkey), computed where it is checked.

pub global VKEY_SIZE: u32 = 115;
pub global PROOF_SIZE: u32 = 458;
pub global TREE_DEPTH: u32 = 12;

// A subproof as fields: vkey ‖ proof ‖ public_inputs ‖ tree_index ‖ tree_hash_path
pub global CSC_TO_DSC_FIELDS: u32 = VKEY_SIZE + PROOF_SIZE + 1 + 1 + TREE_DEPTH;
pub global DSC_TO_ID_DATA_FIELDS: u32 = VKEY_SIZE + PROOF_SIZE + 2 + 1 + TREE_DEPTH;
pub global INTEGRITY_CHECK_FIELDS: u32 = VKEY_SIZE + PROOF_SIZE + 3 + 1 + TREE_DEPTH;
pub global DISCLOSURE_FIELDS: u32 = VKEY_SIZE + PROOF_SIZE + 4 + 1 + TREE_DEPTH;

/// A subproof whose `P` public inputs are the ones the outer circuit passes through.
pub struct Subproof<let P: u32> {
    pub vkey: [Field; VKEY_SIZE],
    pub proof: [Field; PROOF_SIZE],
    pub public_inputs: [Field; P],
    pub tree_index: Field,
    pub tree_hash_path: [Field; TREE_DEPTH],
}

/// comm_out (the certificate registry root is the outer public input)
pub type CSCtoDSCProof = Subproof<1>;
/// comm_in, comm_out
pub type DSCtoIDDataProof = Subproof<2>;
/// comm_in, comm_out, verification_method
pub type IntegrityCheckProof = Subproof<3>;
/// comm_in, scoped_nullifier, nullifier_type, oprf_pk_hash
pub type DisclosureProof = Subproof<4>;

impl<let P: u32> Subproof<P> {
    /// Reads a subproof laid out as vkey ‖ proof ‖ public_inputs ‖ tree_index ‖ tree_hash_path.
    pub fn from_fields<let L: u32>(fields: [Field; L]) -> Self {
        assert(L == VKEY_SIZE + PROOF_SIZE + P + 1 + TREE_DEPTH, "wrong subproof length");
        let mut vkey = [0; VKEY_SIZE];
        for i in 0..VKEY_SIZE {
            vkey[i] = fields[i];
        }
        let mut proof = [0; PROOF_SIZE];
        for i in 0..PROOF_SIZE {
            proof[i] = fields[VKEY_SIZE + i];
        }
        let mut public_inputs = [0; P];
        for i in 0..P {
            public_inputs[i] = fields[VKEY_SIZE + PROOF_SIZE + i];
        }
        let tree_index = fields[VKEY_SIZE + PROOF_SIZE + P];
        let mut tree_hash_path = [0; TREE_DEPTH];
        for i in 0..TREE_DEPTH {
            tree_hash_path[i] = fields[VKEY_SIZE + PROOF_SIZE + P + 1 + i];
        }
        Subproof { vkey, proof, public_inputs, tree_index, tree_hash_path }
    }
}

/// What `outer_count_{N+3}` takes as public inputs, in its order. Here they are claims the glue
/// constrains, exactly as the outer circuit constrains its public inputs.
pub struct OuterPublicInputs<let N: u32> {
    pub certificate_registry_root: Field,
    pub circuit_registry_root: Field,
    pub current_date: u64,
    pub service_scope: Field,
    pub service_subscope: Field,
    pub param_commitments: [Field; N],
    pub nullifier_type: Field,
    pub scoped_nullifier: Field,
    pub oprf_pk_hash: Field,
    pub verification_method: Field,
}

pub global OUTER_PUBLIC_INPUTS_BASE: u32 = 9;

impl<let N: u32> OuterPublicInputs<N> {
    /// Reads the outer circuit's public inputs, in its order: N + 9 fields.
    pub fn from_fields<let L: u32>(fields: [Field; L]) -> Self {
        assert(L == N + OUTER_PUBLIC_INPUTS_BASE, "wrong outer public inputs length");
        // The outer circuit types current_date as u64, which range-checks it.
        let current_date = fields[2] as u64;
        assert(current_date as Field == fields[2], "current_date out of range");
        let mut param_commitments = [0; N];
        for i in 0..N {
            param_commitments[i] = fields[5 + i];
        }
        OuterPublicInputs {
            certificate_registry_root: fields[0],
            circuit_registry_root: fields[1],
            current_date,
            service_scope: fields[3],
            service_subscope: fields[4],
            param_commitments,
            nullifier_type: fields[5 + N],
            scoped_nullifier: fields[6 + N],
            oprf_pk_hash: fields[7 + N],
            verification_method: fields[8 + N],
        }
    }
}

/// Everything the outer circuit takes, public and private.
pub struct Subproofs<let N: u32> {
    pub public_inputs: OuterPublicInputs<N>,
    pub csc_to_dsc_proof: CSCtoDSCProof,
    pub dsc_to_id_data_proof: DSCtoIDDataProof,
    pub integrity_check_proof: IntegrityCheckProof,
    pub disclosure_proofs: [DisclosureProof; N],
}
