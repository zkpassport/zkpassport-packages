// This test pins the fixtures we use to test the Noir libraries to their external references:
// - the commitment anchors in fixtures.nr to the SDK's conformance vectors,
// - FIXTURE_PUBLIC_INPUTS to the public inputs of the checked-in disclose proof fixture,
// - the proof fixtures themselves to the circuits submodule commit they were generated from.
//
// Run from the repo root: `bun test packages/aztec/test-harness/fixture-conformance.test.ts`
import { expect, test } from "bun:test"
import { execSync } from "child_process"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import vectors from "../../zkpassport-utils/conformance/vectors.json"
import ageFixture from "./fixtures/outer_count_5_age.json"
import discloseFixture from "./fixtures/outer_count_4_disclose.json"
import { evaluateExpressions, parseNoirFile } from "./vendor/constants-generator"

const FIXTURES_NR = fileURLToPath(new URL("../noir/core/src/fixtures.nr", import.meta.url))
// name => decimal string (or an array of them, for array globals)
const anchors = evaluateExpressions(
  parseNoirFile(readFileSync(FIXTURES_NR, "utf8")).constantsExpressions,
)
const hex = (name: string): string =>
  "0x" +
  BigInt(anchors[name] as string)
    .toString(16)
    .padStart(64, "0")
const vector = (proofType: string) => vectors.vectors.find((v) => v.proofType === proofType)!
const namedVector = (name: string) => vectors.vectors.find((v) => v.name === name)!

test("every constant in fixtures.nr is checked here", () => {
  expect(Object.keys(anchors).sort()).toEqual([
    "AGE_18_COMMITMENT",
    "BIND_ACCOUNT",
    "BIND_BASE_COMMITMENT",
    "BIND_COMMITMENT",
    "BIND_CUSTOM_DATA_BASE_COMMITMENT",
    "BIND_CUSTOM_DATA_COMMITMENT",
    "BIND_CUSTOM_DATA_ETHEREUM_COMMITMENT",
    "BIND_CUSTOM_DATA_ETHEREUM_SEPOLIA_COMMITMENT",
    "BIND_CUSTOM_DATA_WITHOUT_ACCOUNT_COMMITMENT",
    "BIND_ETHEREUM_COMMITMENT",
    "BIND_ETHEREUM_SEPOLIA_COMMITMENT",
    "BIND_LONGEST_CUSTOM_DATA_COMMITMENT",
    "BIRTHDATE_COMMITMENT",
    "DISCLOSE_COMMITMENT",
    "EXPIRY_DATE_COMMITMENT",
    "FACE_MATCH_COMMITMENT",
    "FIXTURE_PUBLIC_INPUTS",
    "ISSUING_COUNTRY_EXCLUSION_COMMITMENT",
    "ISSUING_COUNTRY_INCLUSION_COMMITMENT",
    "NATIONALITY_EXCLUSION_COMMITMENT",
    "NATIONALITY_INCLUSION_COMMITMENT",
  ])
})

test("AGE_18_COMMITMENT matches the published age vector", () => {
  expect(hex("AGE_18_COMMITMENT")).toBe(vector("age").commitment)
})

test.each([
  ["BIRTHDATE_COMMITMENT", "birthdate"],
  ["EXPIRY_DATE_COMMITMENT", "expiry_date"],
  ["NATIONALITY_INCLUSION_COMMITMENT", "nationality_inclusion"],
  ["NATIONALITY_EXCLUSION_COMMITMENT", "nationality_exclusion"],
  ["ISSUING_COUNTRY_INCLUSION_COMMITMENT", "issuing_country_inclusion"],
  ["ISSUING_COUNTRY_EXCLUSION_COMMITMENT", "issuing_country_exclusion"],
])("%s matches the published %s vector", (anchor, proofType) => {
  expect(hex(anchor)).toBe(vector(proofType).commitment)
})

test("FACE_MATCH_COMMITMENT matches the published facematch vector", () => {
  expect(hex("FACE_MATCH_COMMITMENT")).toBe(namedVector("facematch_ios_strict").commitment)
})

test("DISCLOSE_COMMITMENT matches the published disclose vector", () => {
  expect(hex("DISCLOSE_COMMITMENT")).toBe(vector("disclose").commitment)
})

test("BIND_ACCOUNT matches the published Aztec testnet bind vector's user address", () => {
  expect(hex("BIND_ACCOUNT")).toBe(
    namedVector("bind_user_address_aztec_testnet").params.userAddress,
  )
})

test("BIND_COMMITMENT matches the published Aztec testnet bind vector", () => {
  expect(hex("BIND_COMMITMENT")).toBe(namedVector("bind_user_address_aztec_testnet").commitment)
})

// Chain ids of 1, 2 and 3 bytes, bound to the same account
test.each([
  ["BIND_ETHEREUM_COMMITMENT", "bind_user_address_ethereum"],
  ["BIND_BASE_COMMITMENT", "bind_user_address_base"],
  ["BIND_ETHEREUM_SEPOLIA_COMMITMENT", "bind_user_address_ethereum_sepolia"],
])("%s matches the published %s vector", (anchor, name) => {
  expect(namedVector(name).params.userAddress).toBe(hex("BIND_ACCOUNT"))
  expect(hex(anchor)).toBe(namedVector(name).commitment)
})

// Custom data, after chain ids of each length and without an account
test.each([
  ["BIND_CUSTOM_DATA_COMMITMENT", "bind_user_address_custom_data_aztec_testnet"],
  ["BIND_CUSTOM_DATA_ETHEREUM_COMMITMENT", "bind_user_address_custom_data_ethereum"],
  ["BIND_CUSTOM_DATA_BASE_COMMITMENT", "bind_user_address_custom_data_base"],
  [
    "BIND_CUSTOM_DATA_ETHEREUM_SEPOLIA_COMMITMENT",
    "bind_user_address_custom_data_ethereum_sepolia",
  ],
  ["BIND_LONGEST_CUSTOM_DATA_COMMITMENT", "bind_user_address_longest_custom_data_aztec_testnet"],
])("%s matches the published %s vector", (anchor, name) => {
  expect(namedVector(name).params.userAddress).toBe(hex("BIND_ACCOUNT"))
  expect(hex(anchor)).toBe(namedVector(name).commitment)
})

test("BIND_CUSTOM_DATA_WITHOUT_ACCOUNT_COMMITMENT matches the published vector without an address", () => {
  const { params, commitment } = namedVector("bind_custom_data_aztec_testnet")
  expect("userAddress" in params).toBe(false)
  expect(hex("BIND_CUSTOM_DATA_WITHOUT_ACCOUNT_COMMITMENT")).toBe(commitment)
})

test("FIXTURE_PUBLIC_INPUTS matches the disclose fixture's public inputs", () => {
  const pis = anchors.FIXTURE_PUBLIC_INPUTS
  expect(Array.isArray(pis)).toBe(true)
  expect(pis).toHaveLength(9)
  expect((pis as string[]).map(BigInt)).toEqual(
    discloseFixture.publicInputs.map((pi: string) => BigInt(pi)),
  )
})

// The age fixture is an outer_count_5 proof (age + bind subproofs): slots 5 and 6 are its two
// param commitments, in prover-chosen order: the age anchor and the bind subproof's commitment,
// over the address and the chain the fixture is bound to. core's txe.nr test recomputes the
// latter from proof.nr's bound address and chain id.
test("the age fixture's param commitments are the age anchor and its bind commitment", () => {
  expect(ageFixture.publicInputs).toHaveLength(10)
  const params = ageFixture.publicInputs.slice(5, 7).map((pi: string) => BigInt(pi))
  const expected = [
    BigInt(anchors.AGE_18_COMMITMENT as string),
    BigInt(ageFixture.bindParamCommitment),
  ]
  expect(params.toSorted()).toEqual(expected.toSorted())
})

test("the age fixture is bound to the BIND_ACCOUNT anchor", () => {
  expect(BigInt(ageFixture.bindAddress)).toBe(BigInt(anchors.BIND_ACCOUNT as string))
})

test("proof fixtures were generated from the pinned circuits commit", () => {
  // The gitlink recorded in the tree ("160000 commit <sha>\tpath"), not the submodule
  // checkout, so this works without `git submodule update`.
  const pinnedCommit = execSync("git ls-tree HEAD packages/aztec/test-harness/circuits", {
    cwd: new URL("../../..", import.meta.url).pathname,
  })
    .toString()
    .split(/\s+/)[2]
  expect(pinnedCommit).toMatch(/^[0-9a-f]{40}$/)
  expect(ageFixture.circuitsCommit).toBe(pinnedCommit)
  expect(discloseFixture.circuitsCommit).toBe(pinnedCommit)
})

test("each proof fixture records its own outer circuit", () => {
  expect(discloseFixture.circuit).toBe("outer_count_4")
  expect(ageFixture.circuit).toBe("outer_count_5")
  expect(ageFixture.vkeyHashBB).not.toBe(discloseFixture.vkeyHashBB)
})

test("both proof fixtures were proved with the same circuits release", () => {
  expect(ageFixture.circuitVersion).toMatch(/^\d+\.\d+\.\d+$/)
  expect(discloseFixture.circuitVersion).toBe(ageFixture.circuitVersion)
  expect(discloseFixture.circuitRegistryRoot).toBe(ageFixture.circuitRegistryRoot)
})

// fixtures/proof.nr is regenerated by generate-proof-fixtures.sh when a new proof is captured;
// the JSON must stay in step with it.
test("the proof-fixture globals match the age proof fixture", () => {
  const PROOF_NR = fileURLToPath(new URL("../noir/core/src/fixtures/proof.nr", import.meta.url))

  const gen = evaluateExpressions(
    parseNoirFile(readFileSync(PROOF_NR, "utf8")).constantsExpressions,
  )

  const expectedBlob = [
    ...ageFixture.vkeyFields,
    ...ageFixture.proof,
    ...ageFixture.publicInputs,
  ].map((x: string) => BigInt(x).toString())

  expect(gen.AGE_FIXTURE_BLOB).toEqual(expectedBlob)

  expect(BigInt(gen.AGE_FIXTURE_CERT_ROOT as string)).toBe(
    BigInt(ageFixture.certificateRegistryRoot),
  )

  expect(BigInt(gen.AGE_FIXTURE_CIRCUIT_ROOT as string)).toBe(
    BigInt(ageFixture.circuitRegistryRoot),
  )

  expect(BigInt(gen.AGE_FIXTURE_VK_HASH as string)).toBe(BigInt(ageFixture.vkeyHashBB))
  expect(BigInt(gen.AGE_FIXTURE_CURRENT_DATE as string)).toBe(BigInt(ageFixture.nowTimestamp))
  expect(BigInt(gen.AGE_FIXTURE_BIND_ADDRESS as string)).toBe(BigInt(ageFixture.bindAddress))
  expect(BigInt(gen.AGE_FIXTURE_BIND_CHAIN_ID as string)).toBe(BigInt(ageFixture.bindChainId))
})
