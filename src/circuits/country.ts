import { Alpha3Code } from "i18n-iso-countries"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { rightPadArrayWithZeros } from "../utils"
import { CountryCommittedInputs, ProofResult } from "@/types"

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

export function getCountryListFromCountryProof(proof: ProofResult): Alpha3Code[] {
  const commitedInputs = proof.committedInputs as CountryCommittedInputs
  const result: Alpha3Code[] = []
  for (let i = 0; i < commitedInputs.countries.length; i += 3) {
    if (Number(commitedInputs.countries[i]) !== 0) {
      result.push(
        new TextDecoder().decode(
          new Uint8Array(commitedInputs.countries.slice(i, i + 3).map(Number)),
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
 * @param countries - The list of countries.
 * @param sorted - Whether the countries are sorted.
 * @returns The parameter commitment.
 */
export async function getCountryParameterCommitment(
  countries: Alpha3Code[],
  sorted = false,
): Promise<bigint> {
  const countrySums = countries.map((c) => getCountryWeightedSum(c))
  const countrySumsBigInt = rightPadArrayWithZeros(
    sorted ? countrySums.sort((a, b) => a - b) : countrySums,
    200,
  ).map((x) => BigInt(x))
  const countryParameterCommitment = await poseidon2HashAsync(countrySumsBigInt)
  return countryParameterCommitment
}
