import { Alpha3Code } from "i18n-iso-countries"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoField, rightPadArrayWithZeros } from "../utils"
import { CountryCommittedInputs } from "../types"
import { sha256 } from "@noble/hashes/sha256"
import { ProofType } from "."

export function getCountryWeightedSum(country: Alpha3Code): number {
  return country.charCodeAt(0) * 0x10000 + country.charCodeAt(1) * 0x100 + country.charCodeAt(2)
}

export function getCountryFromWeightedSum(weightedSum: number): Alpha3Code {
  return String.fromCharCode(
    Math.floor(weightedSum / 0x10000),
    Math.floor(weightedSum / 0x100) % 256,
    weightedSum % 256,
  ) as Alpha3Code
}

export function getCountryListFromCommittedInputs(
  committedInputs: CountryCommittedInputs,
): Alpha3Code[] {
  const result: Alpha3Code[] = []
  for (let i = 0; i < committedInputs.countries.length; i += 3) {
    if (Number(committedInputs.countries[i]) !== 0) {
      result.push(
        new TextDecoder().decode(
          new Uint8Array(committedInputs.countries.slice(i, i + 3).map(Number)),
        ) as Alpha3Code,
      )
    }
  }
  return result
}

/**
 * Get the number of public inputs for the country exclusion proof.
 * @returns The number of public inputs.
 */
export function getCountryExclusionProofPublicInputCount(): number {
  return 5
}

/**
 * Get the number of public inputs for the country inclusion proof.
 * @returns The number of public inputs.
 */
export function getCountryInclusionProofPublicInputCount(): number {
  return 5
}

/**
 * Get the parameter commitment for the country proof (inclusion and exclusion alike).
 * @param proofType - The proof type.
 * @param countries - The list of countries.
 * @param sorted - Whether the countries are sorted.
 * @returns The parameter commitment.
 */
export async function getCountryParameterCommitment(
  proofType: ProofType,
  countries: Alpha3Code[],
  sorted = false,
): Promise<bigint> {
  const countrySums = countries.map((c) => getCountryWeightedSum(c))
  const countrySumsBigInt = rightPadArrayWithZeros(
    sorted ? countrySums.sort((a, b) => a - b) : countrySums,
    200,
  ).map((x) => BigInt(x))
  const countryParameterCommitment = await poseidon2HashAsync([
    BigInt(proofType),
    ...countrySumsBigInt,
  ])
  return countryParameterCommitment
}

/**
 * Get the EVM parameter commitment for the country proof (inclusion and exclusion alike).
 * @param proofType - The proof type.
 * @param countries - The list of countries.
 * @param sorted - Whether the countries are sorted.
 * @returns The parameter commitment.
 */
export async function getCountryEVMParameterCommitment(
  proofType: ProofType,
  countries: Alpha3Code[],
  sorted = false,
): Promise<bigint> {
  if (sorted) {
    countries.sort((a, b) => a.localeCompare(b))
  }
  const countryBytes = countries.map((c) => Array.from(new TextEncoder().encode(c))).flat()
  // 200 country code of 3 bytes each, so 600 bytes total
  const countryBytesHash = sha256(
    new Uint8Array([proofType, ...rightPadArrayWithZeros(countryBytes, 600)]),
  )
  const countryBytesHashBigInt = packBeBytesIntoField(countryBytesHash, 31)
  return countryBytesHashBigInt
}
