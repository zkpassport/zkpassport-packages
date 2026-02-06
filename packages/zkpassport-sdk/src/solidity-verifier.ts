/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  AgeCommittedInputs,
  BindCommittedInputs,
  CountryCommittedInputs,
  DateCommittedInputs,
  DiscloseCommittedInputs,
  DisclosureCircuitName,
  FacematchCommittedInputs,
  formatBoundData,
  getCommittedInputCount,
  getNumberOfPublicInputs,
  getParamCommitmentsFromOuterProof,
  getProofData,
  numberToBytesBE,
  ProofResult,
  ProofType,
  ProofTypeLength,
  rightPadArrayWithZeros,
  SanctionsCommittedInputs,
} from "@zkpassport/utils"
import { SolidityVerifierParameters } from "./types"
import { DEFAULT_VALIDITY } from "./constants"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import ZKPassportVerifierAbi from "./assets/abi/ZKPassportVerifier.json"

export class SolidityVerifier {
  /**
   * Get the details for the Solidity verifier contract for a given network.
   * Rather than using the chain id directly, we restrict to the actual networks
   * supported by ZKPassport.
   * @param network The network to get the details for
   * @returns The address, function name, and ABI for the verifier contract
   */
  public static getDetails(): {
    address: `0x${string}`
    functionName: string
    abi: {
      type: "function" | "event" | "constructor"
      name: string
      inputs: { name: string; type: string; internalType: string }[]
      outputs: { name: string; type: string; internalType: string }[]
    }[]
  } {
    const baseConfig = {
      functionName: "verify",
      abi: ZKPassportVerifierAbi.abi as any,
    }
    return {
      ...baseConfig,
      // The Root Verifier has a deterministic address on all networks
      address: "0x1D000001000EFD9a6371f4d90bB8920D5431c0D8",
    }
  }

  /**
   * Format the proof for the Solidity verifier contract.
   * @param proof The proof to format
   * @param validityPeriodInSeconds The validity period in seconds
   * @param domain The domain to use for the service config
   * @param scope The scope to use for the service config
   * @param devMode Whether to use the dev mode
   * Note that on mainnets, the dev mode will be ignored as verification
   * will always fail for mock passports. It only applies to testnets.
   * @returns The parameters for the Solidity verifier contract
   */
  public static getParameters({
    proof,
    validityPeriodInSeconds = DEFAULT_VALIDITY,
    domain,
    scope,
    devMode = false,
  }: {
    proof: ProofResult
    validityPeriodInSeconds?: number
    domain: string
    scope?: string
    devMode?: boolean
  }) {
    if (!proof.name?.startsWith("outer_evm")) {
      throw new Error(
        "This proof cannot be verified on an EVM chain. Please make sure to use the `compressed-evm` mode.",
      )
    }
    const proofData = getProofData(proof.proof as string, getNumberOfPublicInputs(proof.name!))
    const committedInputCounts: { circuitName: DisclosureCircuitName; count: number }[] = []
    const committedInputs: { circuitName: DisclosureCircuitName; inputs: string }[] = []
    for (const key in proof.committedInputs) {
      const committedInputCount = getCommittedInputCount(key as DisclosureCircuitName)
      const circuitName = key as DisclosureCircuitName
      committedInputCounts.push({ circuitName, count: committedInputCount })
      let compressedCommittedInputs = ""
      if (
        circuitName === "inclusion_check_issuing_country_evm" ||
        circuitName === "inclusion_check_nationality_evm" ||
        circuitName === "exclusion_check_issuing_country_evm" ||
        circuitName === "exclusion_check_nationality_evm"
      ) {
        const value = proof.committedInputs[circuitName] as CountryCommittedInputs
        const formattedCountries = value.countries
        if (
          circuitName === "exclusion_check_issuing_country_evm" ||
          circuitName === "exclusion_check_nationality_evm"
        ) {
          formattedCountries.sort((a, b) => a.localeCompare(b))
        }
        const proofType = (() => {
          switch (circuitName) {
            case "exclusion_check_issuing_country_evm":
              return ProofType.ISSUING_COUNTRY_EXCLUSION
            case "exclusion_check_nationality_evm":
              return ProofType.NATIONALITY_EXCLUSION
            case "inclusion_check_issuing_country_evm":
              return ProofType.ISSUING_COUNTRY_INCLUSION
            case "inclusion_check_nationality_evm":
              return ProofType.NATIONALITY_INCLUSION
          }
        })()
        compressedCommittedInputs =
          proofType.toString(16).padStart(2, "0") +
          ProofTypeLength[proofType].evm.toString(16).padStart(4, "0") +
          rightPadArrayWithZeros(
            formattedCountries.map((c) => Array.from(new TextEncoder().encode(c))).flat(),
            600,
          )
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("")
      } else if (circuitName === "compare_age_evm") {
        const value = proof.committedInputs[circuitName] as AgeCommittedInputs
        compressedCommittedInputs =
          ProofType.AGE.toString(16).padStart(2, "0") +
          ProofTypeLength[ProofType.AGE].evm.toString(16).padStart(4, "0") +
          value.minAge.toString(16).padStart(2, "0") +
          value.maxAge.toString(16).padStart(2, "0")
      } else if (circuitName === "compare_birthdate_evm") {
        const value = proof.committedInputs[circuitName] as DateCommittedInputs
        const minDateBytes = Array.from(numberToBytesBE(value.minDateTimestamp, 8))
        const maxDateBytes = Array.from(numberToBytesBE(value.maxDateTimestamp, 8))
        compressedCommittedInputs =
          ProofType.BIRTHDATE.toString(16).padStart(2, "0") +
          ProofTypeLength[ProofType.BIRTHDATE].evm.toString(16).padStart(4, "0") +
          minDateBytes.map((x) => x.toString(16).padStart(2, "0")).join("") +
          maxDateBytes.map((x) => x.toString(16).padStart(2, "0")).join("")
      } else if (circuitName === "compare_expiry_evm") {
        const value = proof.committedInputs[circuitName] as DateCommittedInputs
        const minDateBytes = Array.from(numberToBytesBE(value.minDateTimestamp, 8))
        const maxDateBytes = Array.from(numberToBytesBE(value.maxDateTimestamp, 8))
        compressedCommittedInputs =
          ProofType.EXPIRY_DATE.toString(16).padStart(2, "0") +
          ProofTypeLength[ProofType.EXPIRY_DATE].evm.toString(16).padStart(4, "0") +
          minDateBytes.map((x) => x.toString(16).padStart(2, "0")).join("") +
          maxDateBytes.map((x) => x.toString(16).padStart(2, "0")).join("")
      } else if (circuitName === "disclose_bytes_evm") {
        const value = proof.committedInputs[circuitName] as DiscloseCommittedInputs
        compressedCommittedInputs =
          ProofType.DISCLOSE.toString(16).padStart(2, "0") +
          ProofTypeLength[ProofType.DISCLOSE].evm.toString(16).padStart(4, "0") +
          value.discloseMask.map((x) => x.toString(16).padStart(2, "0")).join("") +
          value.disclosedBytes.map((x) => x.toString(16).padStart(2, "0")).join("")
      } else if (circuitName === "bind_evm") {
        const value = proof.committedInputs[circuitName] as BindCommittedInputs
        compressedCommittedInputs =
          ProofType.BIND.toString(16).padStart(2, "0") +
          ProofTypeLength[ProofType.BIND].evm.toString(16).padStart(4, "0") +
          rightPadArrayWithZeros(formatBoundData(value.data), 509)
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("")
      } else if (circuitName === "exclusion_check_sanctions_evm") {
        const value = proof.committedInputs[circuitName] as SanctionsCommittedInputs
        compressedCommittedInputs += ProofType.SANCTIONS_EXCLUSION.toString(16).padStart(2, "0")
        compressedCommittedInputs += ProofTypeLength[ProofType.SANCTIONS_EXCLUSION].evm
          .toString(16)
          .padStart(4, "0")
        compressedCommittedInputs += Array.from(numberToBytesBE(BigInt(value.rootHash), 32))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
        compressedCommittedInputs += value.isStrict ? "01" : "00"
      } else if (circuitName.startsWith("facematch") && circuitName.endsWith("_evm")) {
        const value = proof.committedInputs[circuitName] as FacematchCommittedInputs
        compressedCommittedInputs += ProofType.FACEMATCH.toString(16).padStart(2, "0")
        compressedCommittedInputs += ProofTypeLength[ProofType.FACEMATCH].evm
          .toString(16)
          .padStart(4, "0")
        compressedCommittedInputs += Array.from(numberToBytesBE(BigInt(value.rootKeyLeaf), 32))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
        compressedCommittedInputs += value.environment === "development" ? "00" : "01"
        compressedCommittedInputs += Array.from(numberToBytesBE(BigInt(value.appIdHash), 32))
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
        compressedCommittedInputs += Array.from(
          numberToBytesBE(BigInt(value.integrityPubkeyHash), 32),
        )
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("")
        compressedCommittedInputs += value.mode === "regular" ? "01" : "02"
      } else {
        throw new Error(`Unsupported circuit for EVM verification: ${circuitName}`)
      }
      committedInputs.push({ circuitName, inputs: compressedCommittedInputs })
    }
    const parameterCommitments = getParamCommitmentsFromOuterProof(proofData).map((x) =>
      x.toString(16).padStart(64, "0"),
    )
    let compressedCommittedInputs = ""
    const committedInputCountsArray = []
    for (const commitment of parameterCommitments) {
      const committedInput = committedInputs.find((x) => {
        const rawHashedInputs = sha256(hexToBytes(x.inputs))
        // Shift the hash 8 bits to the right (1 byte)
        // as one byte is dropped in the circuit to fit in the 254-bit field size
        const hashedInputs = new Uint8Array(rawHashedInputs.length)
        // Move each byte 1 position to the right (shifting 8 bits)
        for (let i = 0; i < rawHashedInputs.length - 1; i++) {
          hashedInputs[i + 1] = rawHashedInputs[i]
        }
        // First byte becomes 0 (since we're shifting right)
        hashedInputs[0] = 0

        return bytesToHex(hashedInputs) === commitment.replace("0x", "")
      })
      if (committedInput) {
        const count = committedInputCounts.find(
          (x) => x.circuitName === committedInput.circuitName,
        )?.count
        if (count) {
          committedInputCountsArray.push(count)
          compressedCommittedInputs += committedInput.inputs
        } else {
          throw new Error(`Unknown circuit name: ${committedInput.circuitName}`)
        }
      } else {
        throw new Error(`Invalid commitment: ${commitment}`)
      }
    }
    const versionParts = proof.version?.split(".").map((x) => Number(x))
    if (!versionParts || versionParts.length !== 3) {
      throw new Error("Invalid version format")
    }
    const versionBytes = new Uint8Array([
      ...numberToBytesBE(versionParts[0], 2),
      ...numberToBytesBE(versionParts[1], 2),
      ...numberToBytesBE(versionParts[2], 2),
    ])
    const versionBytes32 = `0x${bytesToHex(versionBytes).padEnd(64, "0")}`
    const params: SolidityVerifierParameters = {
      version: versionBytes32,
      proofVerificationData: {
        // Make sure the vkeyHash is 32 bytes
        vkeyHash: `0x${proof.vkeyHash!.replace("0x", "").padStart(64, "0")}`,
        proof: `0x${proofData.proof.join("")}`,
        publicInputs: proofData.publicInputs,
      },
      committedInputs: `0x${compressedCommittedInputs}`,
      serviceConfig: {
        validityPeriodInSeconds,
        domain,
        scope: scope ?? "",
        devMode,
      },
    }
    return params
  }
}
