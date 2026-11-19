import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assertManifestMatchesRoot,
  type BoolDpmState,
  type CircuitManifest,
  decideVersion,
  decideVk,
  formatVkDiff,
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

test("the default selection seeds every outer_count_N and nothing else", () => {
  const names = selectVks(MANIFEST, {}).map((vk) => vk.name)
  assert.deepEqual(
    names,
    OUTER_COUNTS.map((n) => `outer_count_${n}`),
  )
})

test("the default selection is not explicit; named circuits are, whatever their family", () => {
  assert.ok(selectVks(MANIFEST, {}).every((vk) => !vk.explicit))
  assert.deepEqual(selectVks(MANIFEST, { VK_CIRCUITS: "outer_count_4, outer_evm_count_4" }), [
    { name: "outer_count_4", hash: hash(0x104), explicit: true },
    { name: "outer_evm_count_4", hash: hash(4), explicit: true },
  ])
  assert.deepEqual(selectVks(MANIFEST, { VK_HASH: hash(9) }), [
    { name: "(VK_HASH env)", hash: hash(9), explicit: true },
  ])
})

test("a named circuit missing from the manifest is rejected", () => {
  assert.throws(() => selectVks(MANIFEST, { VK_CIRCUITS: "outer_count_14" }), /"outer_count_14"/)
})

test("a manifest without standard outer circuits is rejected", () => {
  const manifest = { ...MANIFEST, circuits: { outer_evm_count_4: { hash: hash(4) } } }
  assert.throws(() => selectVks(manifest, {}), /no outer_count_N/)
})

test("the manifest and circuit root agree regardless of hex padding and case", () => {
  const root = `0x${"A11".padStart(64, "0")}`
  assert.doesNotThrow(() => assertManifestMatchesRoot(MANIFEST, { root, revoked: false }, "0.23.0"))
  assert.doesNotThrow(() => assertManifestMatchesRoot(MANIFEST, { root: "0xa11", revoked: false }))
})

test("a manifest for another release, another root, or a revoked root is rejected", () => {
  const root = { root: hash(0xa11), revoked: false }
  assert.throws(() => assertManifestMatchesRoot(MANIFEST, root, "0.22.0"), /not the requested/)
  assert.throws(
    () => assertManifestMatchesRoot(MANIFEST, { root: hash(0xb22), revoked: false }),
    /commits to root/,
  )
  assert.throws(() => assertManifestMatchesRoot(MANIFEST, { ...root, revoked: true }), /is revoked/)
  assert.throws(
    () => assertManifestMatchesRoot({ ...MANIFEST, version: undefined }, root),
    /no version/,
  )
})

test("a never-written vk is added without being named", () => {
  assert.deepEqual(decideVk(NEVER_WRITTEN, false, NOW), { status: "add" })
})

test("a removed vk is re-added only when named explicitly", () => {
  assert.deepEqual(decideVk(REMOVED, false, NOW), { status: "revoked" })
  assert.deepEqual(decideVk(REMOVED, true, NOW), { status: "add" })
})

test("an accepted vk is left alone, and a scheduled change is never overridden", () => {
  assert.deepEqual(decideVk(ACCEPTED, true, NOW), { status: "accepted" })
  const pendingAdd = { current: false, scheduled: true, maturesAt: NOW + 600n }
  assert.deepEqual(decideVk(pendingAdd, true, NOW), {
    status: "scheduled",
    to: true,
    maturesAt: NOW + 600n,
  })
  const pendingRemoval = { current: true, scheduled: false, maturesAt: NOW + 600n }
  assert.deepEqual(decideVk(pendingRemoval, true, NOW), {
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

test("the diff names each vk with what the run would do to it", () => {
  const lines = formatVkDiff(
    [
      { name: "outer_count_4", hash: hash(4), explicit: false, decision: { status: "add" } },
      { name: "outer_count_5", hash: hash(5), explicit: false, decision: { status: "accepted" } },
      {
        name: "outer_count_6",
        hash: hash(6),
        explicit: false,
        decision: { status: "scheduled", to: true, maturesAt: NOW + 600n },
      },
      { name: "outer_count_7", hash: hash(7), explicit: false, decision: { status: "revoked" } },
    ],
    NOW,
  )
  assert.equal(lines.length, 4)
  assert.match(lines[0], /^\+ outer_count_4 .* would be added$/)
  assert.match(lines[1], /^= outer_count_5 .* already accepted$/)
  assert.match(lines[2], /^~ outer_count_6 .* already scheduled: accept, live at .*\(~10min\)$/)
  assert.match(lines[3], /^! outer_count_7 .* not re-added unless named/)
})

test("transactions are sent only with SEND_TXS set and DRY_RUN unset", () => {
  assert.equal(sendRequested({}), false)
  assert.equal(sendRequested({ SEND_TXS: "0" }), false)
  assert.equal(sendRequested({ SEND_TXS: "1" }), true)
  assert.equal(sendRequested({ SEND_TXS: "true" }), true)
  assert.equal(sendRequested({ SEND_TXS: "1", DRY_RUN: "1" }), false)
})
