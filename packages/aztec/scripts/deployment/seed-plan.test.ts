import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assertSeedableRelease,
  type BoolDpmState,
  type CircuitManifest,
  decideRoot,
  decideVersion,
  decideVk,
  selectVks,
  sendRequested,
} from "./seed-plan.js"

const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}`

const OUTER_COUNTS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

const MANIFEST: CircuitManifest = {
  version: "0.23.0",
  root: hash(0xa11),
  circuits: {
    sig_check_dsc_tbs_700_rsa_pkcs_4096_sha256: { hash: hash(1) },
    disclose_bytes: { hash: hash(2) },
    outer_aadhaar_count_2: { hash: hash(3) },
    outer_evm_count_4: { hash: hash(4) },
    outer_evm_aadhaar_count_2: { hash: hash(5) },
    ...Object.fromEntries(OUTER_COUNTS.map((n) => [`outer_count_${n}`, { hash: hash(0x100 + n) }])),
  },
}

const NOW = 1_800_000_000n
const NEVER_WRITTEN: BoolDpmState = { current: false, scheduled: false, maturesAt: 0n }
const REMOVED: BoolDpmState = { current: false, scheduled: false, maturesAt: NOW - 3600n }
const ACCEPTED: BoolDpmState = { current: true, scheduled: true, maturesAt: NOW - 3600n }

const [DEFAULT_VK] = selectVks(MANIFEST, {})
const [NAMED_VK] = selectVks(MANIFEST, { VK_CIRCUITS: "outer_count_4" })
const [HASH_VK] = selectVks(MANIFEST, { VK_HASH: hash(9) })

test("the default selection seeds every outer_count_N and nothing else", () => {
  const names = selectVks(MANIFEST, {}).map((vk) => vk.name)
  assert.deepEqual(
    names,
    OUTER_COUNTS.map((n) => `outer_count_${n}`),
  )
})

test("named circuits are seeded whatever their family, and VK_HASH seeds exactly that hash", () => {
  const named = selectVks(MANIFEST, { VK_CIRCUITS: "outer_count_4, outer_evm_count_4" })
  assert.deepEqual(
    named.map(({ name, hash }) => ({ name, hash })),
    [
      { name: "outer_count_4", hash: hash(0x104) },
      { name: "outer_evm_count_4", hash: hash(4) },
    ],
  )
  assert.deepEqual(
    selectVks(MANIFEST, { VK_HASH: hash(9) }).map((vk) => vk.hash),
    [hash(9)],
  )
})

test("a named circuit missing from the manifest is rejected", () => {
  assert.throws(() => selectVks(MANIFEST, { VK_CIRCUITS: "outer_count_14" }), /"outer_count_14"/)
})

test("a manifest without standard outer circuits is rejected", () => {
  const manifest = { ...MANIFEST, circuits: { outer_evm_count_4: { hash: hash(4) } } }
  assert.throws(() => selectVks(manifest, {}), /no outer_count_N/)
})

test("a release is seeded only when it is the requested version and its root is not revoked", () => {
  const root = { root: MANIFEST.root, revoked: false }
  assert.doesNotThrow(() => assertSeedableRelease(MANIFEST, root, "0.23.0"))
  assert.doesNotThrow(() => assertSeedableRelease(MANIFEST, root))
  assert.throws(() => assertSeedableRelease(MANIFEST, root, "0.22.0"), /not the requested/)
  assert.throws(() => assertSeedableRelease(MANIFEST, { ...root, revoked: true }), /is revoked/)
})

test("a never-written vk is added without being named", () => {
  assert.deepEqual(decideVk(DEFAULT_VK, NEVER_WRITTEN, NOW), { status: "add" })
})

test("a removed vk is re-added only when named in VK_CIRCUITS or VK_HASH", () => {
  assert.deepEqual(decideVk(DEFAULT_VK, REMOVED, NOW), { status: "revoked" })
  assert.deepEqual(decideVk(NAMED_VK, REMOVED, NOW), { status: "restore" })
  assert.deepEqual(decideVk(HASH_VK, REMOVED, NOW), { status: "restore" })
})

test("an accepted vk is left alone, and a scheduled change is never overridden", () => {
  assert.deepEqual(decideVk(NAMED_VK, ACCEPTED, NOW), { status: "accepted" })
  const pendingAdd = { current: false, scheduled: true, maturesAt: NOW + 600n }
  assert.deepEqual(decideVk(NAMED_VK, pendingAdd, NOW), {
    status: "scheduled",
    to: true,
    maturesAt: NOW + 600n,
  })
  const pendingRemoval = { current: true, scheduled: false, maturesAt: NOW + 600n }
  assert.deepEqual(decideVk(NAMED_VK, pendingRemoval, NOW), {
    status: "scheduled",
    to: false,
    maturesAt: NOW + 600n,
  })
})

test("a version is enabled only when it was never written", () => {
  assert.deepEqual(decideVersion(NEVER_WRITTEN, NOW), { status: "enable" })
  assert.deepEqual(decideVersion(ACCEPTED, NOW), { status: "enabled" })
  assert.deepEqual(decideVersion(REMOVED, NOW), { status: "disabled" })
  const pendingDisable = { current: true, scheduled: false, maturesAt: NOW + 60n }
  assert.deepEqual(decideVersion(pendingDisable, NOW), {
    status: "scheduled",
    to: false,
    maturesAt: NOW + 60n,
  })
})

const RELEASE_A = 0xaaan
const RELEASE_B = 0xbbbn
const LATEST = { isRootRegistryLatest: true, allowRollback: false }
const OLDER = { isRootRegistryLatest: false, allowRollback: false }
const holds = (root: bigint) => ({ current: root, scheduled: root, maturesAt: NOW - 3600n })

test("an older release's root is not scheduled over the registry's newer root by default", () => {
  assert.deepEqual(decideRoot(RELEASE_A, holds(RELEASE_B), OLDER, NOW), { status: "rollback" })
  const deliberate = { isRootRegistryLatest: false, allowRollback: true }
  assert.deepEqual(decideRoot(RELEASE_A, holds(RELEASE_B), deliberate, NOW), { status: "update" })
})

test("an older release's root is scheduled on a registry that holds no circuit root yet", () => {
  const empty = { current: 0n, scheduled: 0n, maturesAt: 0n }
  assert.deepEqual(decideRoot(RELEASE_A, empty, OLDER, NOW), { status: "update" })
})

test("the RootRegistry's latest root replaces the registry's root", () => {
  assert.deepEqual(decideRoot(RELEASE_B, holds(RELEASE_A), LATEST, NOW), { status: "update" })
})

test("a root the registry already holds or has scheduled is never re-sent, whichever release", () => {
  for (const opts of [LATEST, OLDER]) {
    assert.deepEqual(decideRoot(RELEASE_A, holds(RELEASE_A), opts, NOW), { status: "live" })
    const pendingA = { current: RELEASE_B, scheduled: RELEASE_A, maturesAt: NOW + 600n }
    assert.deepEqual(decideRoot(RELEASE_A, pendingA, opts, NOW), {
      status: "scheduled",
      maturesAt: NOW + 600n,
    })
  }
})

test("transactions are sent only with SEND_TXS=1 and DRY_RUN unset", () => {
  assert.equal(sendRequested({}), false)
  assert.equal(sendRequested({ SEND_TXS: "0" }), false)
  assert.equal(sendRequested({ SEND_TXS: "true" }), false)
  assert.equal(sendRequested({ SEND_TXS: "1" }), true)
  assert.equal(sendRequested({ SEND_TXS: "1", DRY_RUN: "1" }), false)
})
