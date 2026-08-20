// Goldens match zkpassport_core/src/disclosed_data.nr's unit tests
// literal-for-literal — that pairing is the Noir<->TS parity pin.
import assert from "node:assert/strict"
import { test } from "node:test"

import { isIdCard, nationalityBytes, packNationality } from "../src/disclosed-data.ts"

function payload(doc: string, index: number, nat: string): number[] {
  const bytes = new Array<number>(90).fill(0)
  bytes[0] = doc.charCodeAt(0)
  bytes[1] = doc.charCodeAt(1)
  for (let i = 0; i < 3; i++) bytes[index + i] = nat.charCodeAt(i)
  return bytes
}

test("TD3 passport reads offset 54", () => {
  const bytes = payload("P<", 54, "USA")
  assert.equal(isIdCard(bytes), false)
  assert.deepEqual(nationalityBytes(bytes), [0x55, 0x53, 0x41])
  assert.equal(packNationality(bytes), 0x555341n)
})

test("TD1 ID card reads offset 45", () => {
  const bytes = payload("I<", 45, "DEU")
  assert.equal(isIdCard(bytes), true)
  assert.deepEqual(nationalityBytes(bytes), [0x44, 0x45, 0x55])
  assert.equal(packNationality(bytes), 0x444555n)
})

test("raw bytes are not normalized (German passports pack D<<)", () => {
  const bytes = payload("P<", 54, "D<<")
  assert.equal(packNationality(bytes), 0x443c3cn)
})
