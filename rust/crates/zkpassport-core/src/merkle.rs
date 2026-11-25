//! Fixed-depth binary poseidon2 merkle tree.
//!
//! Port of `AsyncIMT` (as used with arity 2 and zero value 0) and
//! `computeMerkleProof` from `@zkpassport/utils` `src/merkle-tree/`.

use crate::poseidon2::poseidon2_hash;
use num_bigint::BigUint;
use serde_json::{json, Value};

pub struct MerkleTree {
    depth: usize,
    /// nodes[level][index]; level 0 = leaves, level depth = root
    nodes: Vec<Vec<BigUint>>,
    /// zeroes[level] = zero subtree hash at that level
    zeroes: Vec<BigUint>,
}

impl MerkleTree {
    pub fn new(depth: usize, zero_value: BigUint, leaves: &[BigUint]) -> Self {
        assert!(
            leaves.len() <= 1usize << depth,
            "the tree cannot contain more than 2^{depth} leaves"
        );
        let mut zeroes = Vec::with_capacity(depth);
        let mut zero = zero_value;
        for _ in 0..depth {
            zeroes.push(zero.clone());
            zero = poseidon2_hash(&[zero.clone(), zero]);
        }

        let mut nodes: Vec<Vec<BigUint>> = vec![Vec::new(); depth + 1];
        if leaves.is_empty() {
            nodes[depth] = vec![zero];
        } else {
            nodes[0] = leaves.to_vec();
            for level in 0..depth {
                let count = nodes[level].len().div_ceil(2);
                let mut next = Vec::with_capacity(count);
                for index in 0..count {
                    let position = index * 2;
                    let left = nodes[level][position].clone();
                    let right = nodes[level]
                        .get(position + 1)
                        .cloned()
                        .unwrap_or_else(|| zeroes[level].clone());
                    next.push(poseidon2_hash(&[left, right]));
                }
                nodes[level + 1] = next;
            }
        }
        Self {
            depth,
            nodes,
            zeroes,
        }
    }

    pub fn root(&self) -> &BigUint {
        &self.nodes[self.depth][0]
    }

    /// Root formatted as `AsyncMerkleTree.root`: 0x + 64-char zero-padded hex.
    pub fn root_hex_padded(&self) -> String {
        format!("0x{:0>64}", format!("{:x}", self.root()))
    }

    /// Sibling per level for the leaf at `index` (arity 2).
    pub fn siblings(&self, index: usize) -> Vec<BigUint> {
        assert!(index < self.nodes[0].len(), "the leaf does not exist");
        let mut siblings = Vec::with_capacity(self.depth);
        let mut idx = index;
        for level in 0..self.depth {
            let sibling_index = if idx % 2 == 0 { idx + 1 } else { idx - 1 };
            let sibling = self.nodes[level]
                .get(sibling_index)
                .cloned()
                .unwrap_or_else(|| self.zeroes[level].clone());
            siblings.push(sibling);
            idx /= 2;
        }
        siblings
    }
}

/// `normaliseHex`: 0x-prefixed, lowercase, even-length zero-padded hex.
pub fn normalise_hex(x: &BigUint) -> String {
    let hex = format!("{x:x}");
    format!("0x{}{hex}", if hex.len() % 2 == 1 { "0" } else { "" })
}

/// Port of `computeMerkleProof(leaves, index, height)`.
pub fn compute_merkle_proof(leaves: &[BigUint], index: usize, height: usize) -> Value {
    let tree = MerkleTree::new(height, BigUint::from(0u8), leaves);
    let path: Vec<String> = tree.siblings(index).iter().map(normalise_hex).collect();
    json!({
        "root": normalise_hex(tree.root()),
        "index": index,
        "path": path,
    })
}
