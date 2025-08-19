import AsyncOrderedMT, { MembershipProof, SortedNonMembershipProof, Node, BN254_MODULUS_MINUS_ONE } from "./async-ordered-mt"
import { poseidon2 } from "./index"

// 2^256 modulus for an alternate hash used in one negative test
const MOD = 1n << 256n

function expectProofOk(proof: MembershipProof, leaves: bigint[]): void {
  expect(leaves.includes(proof.leaf)).toBe(true)
  expect(proof.siblings.length).toBe(proof.path.length)
}

describe("AsyncOrderedMT (ordered set)", () => {
  test("initialize sorts and de-duplicates leaves; root stable regardless of order", async () => {
    const depth = 4
    const tree1 = await AsyncOrderedMT.create(depth, poseidon2)
    const tree2 = await AsyncOrderedMT.create(depth, poseidon2)

    const leaves1 = [5n, 1n, 10n, 1n, 7n, 10n]
    const leaves2 = [10n, 7n, 5n, 1n]

    await tree1.initializeAndSort(leaves1)
    await tree2.initializeAndSort(leaves2)

    expect(tree1.root).toEqual(tree2.root)
  })

  test("exists() reports membership correctly", async () => {
    const depth = 3
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [2n, 4n, 8n]
    await tree.initialize(leaves)

    expect(tree.exists(2n)).toBe(true)
    expect(tree.exists(4n)).toBe(true)
    expect(tree.exists(8n)).toBe(true)
    expect(tree.exists(3n)).toBe(false)
    expect(tree.exists(9n)).toBe(false)
    expect(tree.exists(1n)).toBe(false)
  })

  test("membership proof verifies for each leaf", async () => {
    const depth = 5
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [1n, 3n, 7n, 15n, 31n, 63n]
    await tree.initialize(leaves)

    for (const leaf of leaves) {
      const proof = tree.createMembershipProof(leaf)
      expectProofOk(proof, leaves)
      const ok = await AsyncOrderedMT.verifyMembershipProof(proof, poseidon2)
      expect(ok).toBe(true)
      expect(proof.root).toEqual(tree.root)
    }
  })

  test("non-membership proof: target between two leaves (has left and right)", async () => {
    const depth = 4
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [10n, 20n, 40n, 80n]
    await tree.initialize(leaves)

    const target = 35n // between 20 and 40
    const nm = tree.createNonMembershipProof(target)
    expect(nm.left?.leaf).toBe(20n)
    expect(nm.right?.leaf).toBe(40n)
    const ok = await AsyncOrderedMT.verifyNonMembershipProof(nm, poseidon2)
    expect(ok).toBe(true)
  })

  test("non-membership proof: target is less than first index in tree", async () => {
    const depth = 4
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [10n, 20n, 40n, 80n]
    await tree.initialize(leaves)

    const target = 1n
    const nm = tree.createNonMembershipProof(target)
    expect(nm.left?.leaf).toBe(0n)
    expect(nm.right?.leaf).toBe(10n)
    const ok = await AsyncOrderedMT.verifyNonMembershipProof(nm, poseidon2)
    expect(ok).toBe(true)
  })

  test("non-membership proof: target is greater than last index in tree", async () => {
    const depth = 4
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [10n, 20n, 40n, 80n]
    await tree.initialize(leaves)

    const target = 100n
    const nm = tree.createNonMembershipProof(target)
    expect(nm.left?.leaf).toBe(80n)
    expect(nm.right?.leaf).toBe(BN254_MODULUS_MINUS_ONE)
    const ok = await AsyncOrderedMT.verifyNonMembershipProof(nm, poseidon2)
    expect(ok).toBe(true)
  })

  test("createNonMembershipProof throws if target exists", async () => {
    const depth = 4
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [5n, 10n, 15n]
    await tree.initialize(leaves)

    expect(() => tree.createNonMembershipProof(10n)).toThrow()
  })

  test("non-membership verification fails if neighbor proof tampered", async () => {
    const depth = 4
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [10n, 20n, 40n, 80n]
    await tree.initialize(leaves)

    const target = 35n
    const nm = tree.createNonMembershipProof(target)
    expect(nm.left && nm.right).toBeTruthy()

    // Tamper a sibling in left proof
    if (nm.left) {
      nm.left.proof.siblings[0] = nm.left.proof.siblings[0] ^ 1n
    }
    const ok = await AsyncOrderedMT.verifyNonMembershipProof(nm as SortedNonMembershipProof, poseidon2)
    expect(ok).toBe(false)
  })

  test("membership verification fails if using different hash", async () => {
    const depth = 3
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [3n, 6n, 9n]
    await tree.initialize(leaves)
    const proof = tree.createMembershipProof(6n)

    async function otherHash([a, b]: Node[]): Promise<Node> {
      return (a + 31n * b) % MOD
    }
    const ok = await AsyncOrderedMT.verifyMembershipProof(proof, otherHash)
    expect(ok).toBe(false)
  })

  test("capacity check: throws when too many leaves for depth", async () => {
    const depth = 2 // capacity = 4
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [1n, 2n, 3n, 4n, 5n]
    await expect(tree.initialize(leaves)).rejects.toThrow()
  })

  test("proof structure lengths equal to depth and consistent root", async () => {
    const depth = 6
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [11n, 22n, 33n, 44n, 55n]
    await tree.initialize(leaves)

    const proof = tree.createMembershipProof(44n)
    expect(proof.siblings.length).toBe(depth)
    expect(proof.path.length).toBe(depth)
    const ok = await AsyncOrderedMT.verifyMembershipProof(proof, poseidon2)
    expect(ok).toBe(true)
    expect(proof.root).toEqual(tree.root)
  })

  test("serialize and loadFromSerialized round-trip", async () => {
    const depth = 5
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [3n, 9n, 27n, 81n]
    await tree.initialize(leaves)

    const originalRoot = tree.root
    const serialized = tree.serialize()

    const restored = await AsyncOrderedMT.fromSerialized(serialized, poseidon2)
    expect(restored.root).toEqual(originalRoot)

    // Membership proof on restored tree should verify with same root
    const proof = restored.createMembershipProof(27n)
    const ok = await AsyncOrderedMT.verifyMembershipProof(proof, poseidon2)
    expect(ok).toBe(true)
    expect(proof.root).toEqual(originalRoot)
  })

  test("serialize + initializeAndSort and loadFromSerialized round-trip", async () => {
    const depth = 5
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    const leaves = [81n, 3n, 9n, 27n];
    await tree.initializeAndSort(leaves)

    const originalRoot = tree.root
    const serialized = tree.serialize()

    const restored = await AsyncOrderedMT.fromSerialized(serialized, poseidon2)
    expect(restored.root).toEqual(originalRoot)

    // Membership proof on restored tree should verify with same root
    const proof = restored.createMembershipProof(27n)
    const ok = await AsyncOrderedMT.verifyMembershipProof(proof, poseidon2)
    expect(ok).toBe(true)
    expect(proof.root).toEqual(originalRoot)
  })

  test("fromSerialized rejects invalid payloads", async () => {
    const depth = 3
    const tree = await AsyncOrderedMT.create(depth, poseidon2)
    await tree.initialize([2n, 4n])
    const serialized = tree.serialize()

    // Remove root layer to make it invalid
    const bad = serialized.slice(0, serialized.length - 1)
    await expect(AsyncOrderedMT.fromSerialized(bad, poseidon2)).rejects.toThrow()

    // Corrupt a layer with a non-array
    const bad2: any = [...serialized]
    bad2[0] = null
    await expect(AsyncOrderedMT.fromSerialized(bad2, poseidon2)).rejects.toThrow()
  })
})

 