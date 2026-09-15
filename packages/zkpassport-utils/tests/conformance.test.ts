// Holds this package to conformance/vectors.json, the published reference vectors for the
// parameter-commitment scheme. Other implementations (the circuits repo's Noir libs and
// downstream verifiers) are expected to test against the same file, so a vector only changes
// when the scheme itself changes.
import vectors from "../conformance/vectors.json"
import { getAgeParameterCommitment } from "../src/circuits/age"
import { formatBoundData, getBindParameterCommitment } from "../src/circuits/bind"
import { getDiscloseParameterCommitment } from "../src/circuits/disclose"
import { getSanctionsParameterCommitmentFromRoot } from "../src/circuits/sanctions/sanctions"

type Vector = { name: string; proofType: string; params: Record<string, any>; commitment: string }
const byType = Object.fromEntries((vectors.vectors as Vector[]).map((v) => [v.proofType, v]))
const hex = (b: bigint) => "0x" + b.toString(16).padStart(64, "0")

describe("Conformance vectors", () => {
  test("every vector is checked here", () => {
    expect(vectors.vectors.map((v) => v.proofType).sort()).toEqual([
      "age",
      "bind",
      "disclose",
      "sanctions",
    ])
  })

  test("age", async () => {
    const { params, commitment } = byType.age
    const result = await getAgeParameterCommitment(params.minAge, params.maxAge)
    expect(hex(result)).toEqual(commitment)
  })

  test("disclose", async () => {
    const { params, commitment } = byType.disclose
    const mask = Array.from({ length: params.mrzLength }, () => 0)
    const disclosed = Array.from({ length: params.mrzLength }, () => 0)
    params.maskIndices.forEach((mrzIndex: number, i: number) => {
      mask[mrzIndex] = 1
      disclosed[mrzIndex] = params.disclosedText.charCodeAt(i)
    })
    const result = await getDiscloseParameterCommitment(mask, disclosed)
    expect(hex(result)).toEqual(commitment)
  })

  test("sanctions", async () => {
    const { params, commitment } = byType.sanctions
    const result = await getSanctionsParameterCommitmentFromRoot(
      BigInt(params.root),
      params.isStrict,
    )
    expect(hex(result)).toEqual(commitment)
  })

  test("bind", async () => {
    const { params, commitment } = byType.bind
    const data = formatBoundData({ user_address: params.userAddress })
    const result = await getBindParameterCommitment(data, params.maxLength)
    expect(hex(result)).toEqual(commitment)
  })
})
