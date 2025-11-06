import { Alpha3Code, getAlpha3Code, registerLocale } from "i18n-iso-countries"
import {
  type DisclosableIDCredential,
  type IDCredential,
  type IDCredentialValue,
  type NumericalIDCredential,
  type ProofResult,
  type QueryResult,
  type CountryName,
  type JsonRpcRequest,
  getProofData,
  Query,
  getNumberOfPublicInputs,
  ProofMode,
  BoundData,
  Service,
  SupportedChain,
  formatQueryResultDates,
  IDCredentialConfig,
  FacematchMode,
  SanctionsCountries,
  SanctionsLists,
  NullifierType,
} from "@zkpassport/utils"
import { noLogger as logger } from "./logger"
import i18en from "i18n-iso-countries/langs/en.json"
import { Buffer } from "buffer/"
import { RegistryClient } from "@zkpassport/registry"
import { Bridge, BridgeInterface } from "@obsidion/bridge"
import { QueryBuilder, QueryResultErrors } from "./types"
import { PublicInputChecker } from "./public-input-checker"
import { SolidityVerifier } from "./solidity-verifier"
import { DEFAULT_VALIDITY, VERSION } from "./constants"

// If Buffer is not defined, then we use the Buffer from the buffer package
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer as any
  if (typeof window !== "undefined") {
    window.Buffer = Buffer as any
  }
}

registerLocale(i18en)

function hasRequestedAccessToField(credentialsRequest: Query, field: IDCredential): boolean {
  const fieldValue = credentialsRequest[field as keyof Query]
  const isDefined = fieldValue !== undefined && fieldValue !== null
  if (!isDefined) {
    return false
  }
  for (const key in fieldValue as IDCredentialConfig) {
    if (
      fieldValue[key as keyof typeof fieldValue] !== undefined &&
      fieldValue[key as keyof typeof fieldValue] !== null
    ) {
      return true
    }
  }
  return false
}

function normalizeCountry(country: CountryName | Alpha3Code) {
  if (country === "Zero Knowledge Republic") {
    return "ZKR"
  }
  let normalizedCountry: Alpha3Code | "ZKR" | undefined = undefined
  const alpha3 = getAlpha3Code(country as CountryName, "en") as Alpha3Code | "ZKR" | undefined
  normalizedCountry = alpha3 || (country as Alpha3Code) || "ZKR"
  return normalizedCountry as Alpha3Code | "ZKR"
}

function numericalCompare(
  fnName: "gte" | "gt" | "lte" | "lt",
  key: NumericalIDCredential,
  value: number | Date,
  requestId: string,
  requestIdToConfig: Record<string, Query>,
) {
  requestIdToConfig[requestId][key] = {
    ...requestIdToConfig[requestId][key],
    [fnName]: value,
  }
}

function rangeCompare(
  key: NumericalIDCredential,
  value: [number | Date, number | Date],
  requestId: string,
  requestIdToConfig: Record<string, Query>,
) {
  requestIdToConfig[requestId][key] = {
    ...requestIdToConfig[requestId][key],
    range: value,
  }
}

function generalCompare(
  fnName: "in" | "out" | "eq",
  key: IDCredential,
  value: any,
  requestId: string,
  requestIdToConfig: Record<string, Query>,
) {
  requestIdToConfig[requestId][key] = {
    ...requestIdToConfig[requestId][key],
    [fnName]: value,
  }
}

export {
  SANCTIONED_COUNTRIES,
  EU_COUNTRIES,
  EEA_COUNTRIES,
  SCHENGEN_COUNTRIES,
  ASEAN_COUNTRIES,
  MERCOSUR_COUNTRIES,
  ProofType,
  ProofTypeLength,
  type ProofResult,
} from "@zkpassport/utils"

export * from "./types"

export class ZKPassport {
  private domain: string
  private topicToConfig: Record<string, Query> = {}
  private topicToLocalConfig: Record<
    string,
    {
      validity: number
      mode: ProofMode
      devMode: boolean
    }
  > = {}
  private topicToPublicKey: Record<string, string> = {}
  private topicToBridge: Record<string, BridgeInterface> = {}
  private topicToRequestReceived: Record<string, boolean> = {}
  private topicToService: Record<string, Service> = {}
  private topicToProofs: Record<string, Array<ProofResult>> = {}
  private topicToFailedProofCount: Record<string, number> = {}
  private topicToResults: Record<string, QueryResult> = {}

  private onRequestReceivedCallbacks: Record<string, Array<() => void>> = {}
  private onGeneratingProofCallbacks: Record<string, Array<(topic: string) => void>> = {}
  private onBridgeConnectCallbacks: Record<string, Array<() => void>> = {}
  private onProofGeneratedCallbacks: Record<string, Array<(proof: ProofResult) => void>> = {}
  private onResultCallbacks: Record<
    string,
    Array<
      (response: {
        uniqueIdentifier: string | undefined
        verified: boolean
        result: QueryResult
        queryResultErrors?: Partial<QueryResultErrors>
      }) => void
    >
  > = {}
  private onRejectCallbacks: Record<string, Array<() => void>> = {}
  private onErrorCallbacks: Record<string, Array<(topic: string) => void>> = {}
  //private wasmVerifierInit: boolean = false

  private normalizeDomain(domain: string) {
    return (
      domain
        .trim()
        // Remove protocol
        .replace(/^https?:\/\//, "")
        // Remove trailing slash and anything after it
        .replace(/\/[^/]*$/, "")
        // Remove port
        .replace(/:[0-9]+/, "")
        // Remove query parameters
        .replace(/\?.*$/, "")
        // Remove hash
        .replace(/#.*$/, "")
        .toLowerCase()
    )
  }

  constructor(_domain?: string) {
    if (!_domain && typeof window === "undefined") {
      throw new Error("Domain argument is required in Node.js environment")
    }
    this.domain = this.normalizeDomain(_domain || window.location.hostname)
  }

  private async handleResult(topic: string) {
    const result = this.topicToResults[topic]
    // Clear the results straight away to avoid concurrency issues
    delete this.topicToResults[topic]
    // Verify the proofs and extract the unique identifier (aka nullifier) and the verification result
    const { uniqueIdentifier, verified, queryResultErrors } = await this.verify({
      proofs: this.topicToProofs[topic],
      queryResult: result,
      validity: this.topicToLocalConfig[topic]?.validity,
      scope: this.topicToService[topic]?.scope,
      devMode: this.topicToLocalConfig[topic]?.devMode,
    })
    delete this.topicToProofs[topic]
    const hasFailedProofs = this.topicToFailedProofCount[topic] > 0
    await Promise.all(
      this.onResultCallbacks[topic].map((callback) =>
        callback({
          // If there are failed proofs, we don't return the unique identifier
          // and we set the verified result to false
          uniqueIdentifier: hasFailedProofs ? undefined : uniqueIdentifier,
          verified: hasFailedProofs ? false : verified,
          result,
          queryResultErrors,
        }),
      ),
    )
    // Clear the expected proof count and failed proof count
    delete this.topicToFailedProofCount[topic]
  }

  /**
   * @notice Handle an encrypted message.
   * @param request The request.
   * @param outerRequest The outer request.
   */
  private async handleEncryptedMessage(topic: string, request: JsonRpcRequest) {
    logger.debug("Received encrypted message:", request)
    if (request.method === "accept") {
      logger.debug(`User accepted the request and is generating a proof`)
      await Promise.all(this.onGeneratingProofCallbacks[topic].map((callback) => callback(topic)))
    } else if (request.method === "reject") {
      logger.debug(`User rejected the request`)
      await Promise.all(this.onRejectCallbacks[topic].map((callback) => callback()))
    } else if (request.method === "proof") {
      logger.debug(`User generated proof`)
      this.topicToProofs[topic].push(request.params)
      await Promise.all(
        this.onProofGeneratedCallbacks[topic].map((callback) => callback(request.params)),
      )
      // If the results were received before all the proofs were generated,
      // we can handle the result now
      if (
        this.topicToResults[topic] &&
        request.params.total ===
          this.topicToProofs[topic].length + this.topicToFailedProofCount[topic]
      ) {
        await this.handleResult(topic)
      }
    } else if (request.method === "done") {
      logger.debug(`User sent the query result`)
      this.topicToResults[topic] = formatQueryResultDates(request.params)
      // Make sure all the proofs have been received, otherwise we'll handle the result later
      // once the proofs have all been received
      if (
        this.topicToProofs[topic].length > 0 &&
        this.topicToProofs[topic].length + this.topicToFailedProofCount[topic] ===
          this.topicToProofs[topic][0].total
      ) {
        await this.handleResult(topic)
      }
    } else if (request.method === "error") {
      const error = request.params.error
      if (error && error === "This ID is not supported yet") {
        // This means the user has an ID that is not supported yet
        // So we won't receive any proofs and we can handle the result now
        if (this.topicToResults[topic]) {
          await this.handleResult(topic)
        }
      } else if (error && error.startsWith("Cannot generate proof")) {
        // This means one of the disclosure proofs failed to be generated
        // So we need to keep track of the failed proof count
        this.topicToFailedProofCount[topic] += 1
        // If the expected proof count is now equal to the number of proofs received
        // and the results were received, we can handle the result now
        if (
          this.topicToResults[topic] &&
          this.topicToProofs[topic].length > 0 &&
          this.topicToProofs[topic].length + this.topicToFailedProofCount[topic] ===
            this.topicToProofs[topic][0].total
        ) {
          await this.handleResult(topic)
        }
      }
      await Promise.all(this.onErrorCallbacks[topic].map((callback) => callback(error)))
    }
  }

  private getZkPassportRequest(topic: string): QueryBuilder {
    return {
      eq: <T extends IDCredential>(key: T, value: IDCredentialValue<T>) => {
        if (key === "issuing_country" || key === "nationality") {
          value = normalizeCountry(value as CountryName) as IDCredentialValue<T>
        }
        generalCompare("eq", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      gte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        numericalCompare("gte", key, value, topic, this.topicToConfig)
        if (key === "age" && ((value as number) < 1 || (value as number) >= 100)) {
          throw new Error("Age must be between 1 and 99 (inclusive)")
        }
        return this.getZkPassportRequest(topic)
      },
      gt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        numericalCompare("gt", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      lte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        numericalCompare("lte", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      lt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        numericalCompare("lt", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      range: <T extends NumericalIDCredential>(
        key: T,
        start: IDCredentialValue<T>,
        end: IDCredentialValue<T>,
      ) => {
        rangeCompare(key, [start, end], topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      in: <T extends "nationality" | "issuing_country">(key: T, value: IDCredentialValue<T>[]) => {
        value = value.map((v) => normalizeCountry(v as CountryName)) as IDCredentialValue<T>[]
        generalCompare("in", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      out: <T extends "nationality" | "issuing_country">(key: T, value: IDCredentialValue<T>[]) => {
        value = value.map((v) => normalizeCountry(v as CountryName)) as IDCredentialValue<T>[]
        generalCompare("out", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      disclose: (key: DisclosableIDCredential) => {
        this.topicToConfig[topic][key] = {
          ...this.topicToConfig[topic][key],
          disclose: true,
        }
        return this.getZkPassportRequest(topic)
      },
      bind: (key: keyof BoundData, value: BoundData[keyof BoundData]) => {
        this.topicToConfig[topic].bind = {
          ...this.topicToConfig[topic].bind,
          [key]: value,
        }
        return this.getZkPassportRequest(topic)
      },
      sanctions: (
        countries: SanctionsCountries = "all",
        lists: SanctionsLists = "all",
        options: { strict?: boolean } = { strict: false },
      ) => {
        this.topicToConfig[topic].sanctions = {
          ...this.topicToConfig[topic].sanctions,
          countries:
            countries === "all"
              ? "all"
              : Array.isArray(countries)
                ? ([
                    ...(this.topicToConfig[topic].sanctions?.countries ?? []),
                    ...countries,
                  ] as SanctionsCountries)
                : ([
                    ...(this.topicToConfig[topic].sanctions?.countries ?? []),
                    countries,
                  ] as SanctionsCountries),
          lists:
            lists === "all"
              ? "all"
              : Array.isArray(lists)
                ? [...(this.topicToConfig[topic].sanctions?.lists ?? []), ...lists]
                : [...(this.topicToConfig[topic].sanctions?.lists ?? []), lists],
          strict: options.strict ?? false,
        }
        return this.getZkPassportRequest(topic)
      },
      facematch: (mode: FacematchMode = "regular") => {
        this.topicToConfig[topic].facematch = {
          mode,
        }
        return this.getZkPassportRequest(topic)
      },
      done: () => {
        return {
          url: this._getUrl(topic),
          requestId: topic,
          onRequestReceived: (callback: () => void) =>
            this.onRequestReceivedCallbacks[topic].push(callback),
          onGeneratingProof: (callback: () => void) =>
            this.onGeneratingProofCallbacks[topic].push(callback),
          onBridgeConnect: (callback: () => void) =>
            this.onBridgeConnectCallbacks[topic].push(callback),
          onProofGenerated: (callback: (proof: ProofResult) => void) =>
            this.onProofGeneratedCallbacks[topic].push(callback),
          onResult: (
            callback: (response: {
              uniqueIdentifier: string | undefined
              verified: boolean
              result: QueryResult
              queryResultErrors?: Partial<QueryResultErrors>
            }) => void,
          ) => this.onResultCallbacks[topic].push(callback),
          onReject: (callback: () => void) => this.onRejectCallbacks[topic].push(callback),
          onError: (callback: (error: string) => void) =>
            this.onErrorCallbacks[topic].push(callback),
          isBridgeConnected: () => this.topicToBridge[topic].isBridgeConnected(),
          requestReceived: () => this.topicToRequestReceived[topic] === true,
        }
      },
    }
  }

  /**
   * @notice Create a new request
   * @param name Your service name
   * @param logo The logo of your service
   * @param purpose To explain what you want to do with the user's data
   * @param scope Scope this request to a specific use case
   * @param projectID The project ID of your service
   * @param validity How many seconds ago the proof checking the expiry date of the ID should have been generated
   * @param devMode Whether to enable dev mode. This will allow you to verify mock proofs (i.e. from ZKR)
   * @returns The query builder object.
   */
  public async request({
    name,
    logo,
    purpose,
    scope,
    projectID,
    mode,
    validity,
    devMode,
    topicOverride,
    keyPairOverride,
    cloudProverUrl,
    bridgeUrl,
  }: {
    name: string
    logo: string
    purpose: string
    scope?: string
    mode?: ProofMode
    projectID?: string
    validity?: number
    devMode?: boolean
    topicOverride?: string
    keyPairOverride?: { privateKey: Uint8Array; publicKey: Uint8Array }
    cloudProverUrl?: string
    bridgeUrl?: string
  }): Promise<QueryBuilder> {
    const bridge = await Bridge.create({
      keyPair: keyPairOverride,
      bridgeId: topicOverride,
      bridgeUrl,
    })

    const topic = bridge.connection.getBridgeId()

    this.topicToConfig[topic] = {}
    this.topicToService[topic] = {
      name,
      logo,
      purpose,
      scope,
      projectID,
      cloudProverUrl,
      bridgeUrl,
    }
    this.topicToProofs[topic] = []
    this.topicToLocalConfig[topic] = {
      // Default to 7 days
      validity: validity || DEFAULT_VALIDITY,
      mode: mode || "fast",
      devMode: devMode || false,
    }

    this.onRequestReceivedCallbacks[topic] = []
    this.onGeneratingProofCallbacks[topic] = []
    this.onBridgeConnectCallbacks[topic] = []
    this.onProofGeneratedCallbacks[topic] = []
    this.onResultCallbacks[topic] = []
    this.onRejectCallbacks[topic] = []
    this.onErrorCallbacks[topic] = []

    this.topicToPublicKey[topic] = bridge.getPublicKey()

    this.topicToBridge[topic] = bridge
    bridge.onConnect(async (reconnection: boolean) => {
      logger.debug("Bridge connected")
      logger.debug("Is reconnection:", reconnection)
      await Promise.all(this.onBridgeConnectCallbacks[topic].map((callback) => callback()))
    })
    bridge.onSecureChannelEstablished(async () => {
      logger.debug("Secure channel established")
      await Promise.all(this.onRequestReceivedCallbacks[topic].map((callback) => callback()))
    })
    bridge.onSecureMessage(async (message: any) => {
      logger.debug("Received message:", message)
      this.handleEncryptedMessage(topic, message)
    })
    return this.getZkPassportRequest(topic)
  }

  /**
   * @notice Verify the proofs received from the mobile app.
   * @param proofs The proofs to verify.
   * @param queryResult The query result to verify against
   * @param validity How many seconds ago the proof checking the expiry date of the ID should have been generated
   * @param scope Scope this request to a specific use case
   * @param devMode Whether to enable dev mode. This will allow you to verify mock proofs (i.e. from ZKR)
   * @param writingDirectory The directory (e.g. `./tmp`) where the necessary temporary artifacts for verification are written to.
   * It should only be needed when running the `verify` function on a server with restricted write access (e.g. Vercel)
   * @returns An object containing the unique identifier associated to the user
   * and a boolean indicating whether the proofs were successfully verified.
   */
  public async verify({
    proofs,
    queryResult,
    validity,
    scope,
    devMode = false,
    writingDirectory,
  }: {
    proofs: Array<ProofResult>
    queryResult: QueryResult
    validity?: number
    scope?: string
    devMode?: boolean
    writingDirectory?: string
  }): Promise<{
    uniqueIdentifier: string | undefined
    uniqueIdentifierType: NullifierType | undefined
    verified: boolean
    queryResultErrors?: Partial<QueryResultErrors>
  }> {
    // If no proofs were generated, the results can't be trusted.
    // We still return it but verified will be false
    if (!proofs || proofs.length === 0) {
      return {
        uniqueIdentifier: undefined,
        uniqueIdentifierType: undefined,
        verified: false,
      }
    }
    const formattedResult: QueryResult = formatQueryResultDates(queryResult)

    const { UltraHonkVerifierBackend } = await import("@aztec/bb.js")
    // Automatically set the writing directory to `/tmp` if it is not provided
    // and the code is not running in the browser
    if (typeof window === "undefined" && !writingDirectory) {
      writingDirectory = "/tmp"
    }
    const verifier = new UltraHonkVerifierBackend({
      crsPath: writingDirectory ? writingDirectory + "/.bb-crs" : undefined,
    })
    let verified = true
    let uniqueIdentifier: string | undefined
    let uniqueIdentifierType: NullifierType | undefined
    let queryResultErrors: Partial<QueryResultErrors> | undefined = undefined
    const {
      isCorrect,
      uniqueIdentifier: uniqueIdentifierFromPublicInputs,
      uniqueIdentifierType: uniqueIdentifierTypeFromPublicInputs,
      queryResultErrors: queryResultErrorsFromPublicInputs,
    } = await PublicInputChecker.checkPublicInputs(
      this.domain,
      proofs,
      formattedResult,
      validity,
      scope,
    )
    uniqueIdentifier = uniqueIdentifierFromPublicInputs
    uniqueIdentifierType = uniqueIdentifierTypeFromPublicInputs
    verified = isCorrect
    queryResultErrors = isCorrect ? undefined : queryResultErrorsFromPublicInputs
    if (
      uniqueIdentifier &&
      uniqueIdentifierType &&
      (uniqueIdentifierType === NullifierType.SALTED_MOCK ||
        uniqueIdentifierType === NullifierType.NON_SALTED_MOCK) &&
      !devMode
    ) {
      // If the unique identifier type is a mock nullifier and it is not in dev mode,
      // the proofs are considered invalid as these are mock proofs only meant
      // for testing purposes
      verified = false
      console.warn(
        "You are trying to verify a mock proof. This is only allowed in dev mode. To enable dev mode, set the `devMode` parameter to `true` in the request function parameters.",
      )
    }
    // Only proceed with the proof verification if the public inputs are correct
    if (verified) {
      const registryClient = new RegistryClient({ chainId: 11155111 })
      const circuitManifest = await registryClient.getCircuitManifest(undefined, {
        // We assume all proofs have the same version
        version: proofs[0].version,
      })
      for (const proof of proofs) {
        const isOuterEVM = proof.name?.startsWith("outer_evm_")
        const proofName = proof.name!
        const proofData = getProofData(proof.proof as string, getNumberOfPublicInputs(proofName))
        const hostedPackagedCircuit = await registryClient.getPackagedCircuit(
          proofName,
          circuitManifest,
          // TODO: set to always validate when the issue is vkey hash calculation is fixed
          // Not as important anyway, as the solidity verifier is the ultimate anchor for
          // EVM outer proofs verification
          { validate: !isOuterEVM },
        )
        if (isOuterEVM) {
          try {
            const { createPublicClient, http } = await import("viem")
            const { sepolia } = await import("viem/chains")
            const { address, abi, functionName } =
              this.getSolidityVerifierDetails("ethereum_sepolia")
            const client = createPublicClient({
              chain: sepolia,
              transport: http("https://ethereum-sepolia-rpc.publicnode.com"),
            })
            const params = this.getSolidityVerifierParameters({
              proof,
              domain: this.domain,
              scope,
              devMode,
            })
            const result = await client.readContract({
              address,
              abi,
              functionName,
              args: [params],
            })
            const isVerified = Array.isArray(result) ? Boolean(result[0]) : false
            verified = isVerified
          } catch (error) {
            console.warn("Error verifying proof", error)
            verified = false
          }
        } else {
          const vkeyBytes = Buffer.from(hostedPackagedCircuit.vkey, "base64")
          try {
            verified = await verifier.verifyProof({
              proof: Buffer.from(proofData.proof.join(""), "hex"),
              publicInputs: proofData.publicInputs,
              verificationKey: new Uint8Array(vkeyBytes),
            })
          } catch (e) {
            console.warn("Error verifying proof", e)
            verified = false
          }
        }
        if (!verified) {
          // Break the loop if the proof is not valid
          // and don't bother checking the other proofs
          break
        }
      }
    }
    // If the proofs are not verified, we don't return the unique identifier
    uniqueIdentifier = verified ? uniqueIdentifier : undefined
    uniqueIdentifierType = verified ? uniqueIdentifierType : undefined
    return { uniqueIdentifier, uniqueIdentifierType, verified, queryResultErrors }
  }

  public getSolidityVerifierDetails(network: SupportedChain): {
    address: `0x${string}`
    functionName: string
    abi: {
      type: "function" | "event" | "constructor"
      name: string
      inputs: { name: string; type: string; internalType: string }[]
      outputs: { name: string; type: string; internalType: string }[]
    }[]
  } {
    return SolidityVerifier.getDetails(network)
  }

  public getSolidityVerifierParameters({
    proof,
    validityPeriodInSeconds = DEFAULT_VALIDITY,
    domain,
    scope,
    devMode = false,
  }: {
    proof: ProofResult
    validityPeriodInSeconds?: number
    domain?: string
    scope?: string
    devMode?: boolean
  }) {
    return SolidityVerifier.getParameters({
      proof,
      validityPeriodInSeconds,
      domain: domain ?? this.domain,
      scope,
      devMode,
    })
  }

  private _getUrl(requestId: string) {
    const base64Config = Buffer.from(JSON.stringify(this.topicToConfig[requestId])).toString(
      "base64",
    )
    const base64Service = Buffer.from(JSON.stringify(this.topicToService[requestId])).toString(
      "base64",
    )
    const pubkey = this.topicToPublicKey[requestId]
    // The timestamp is the current time minus the validity period
    // essentially, the data integrity check proof needs to have been generated after the timestamp
    const timestamp = Math.floor(Date.now() / 1000) - this.topicToLocalConfig[requestId].validity
    return `https://zkpassport.id/r?d=${this.domain}&t=${requestId}&c=${base64Config}&s=${base64Service}&p=${pubkey}&m=${this.topicToLocalConfig[requestId].mode}&v=${VERSION}&dt=${timestamp}&dev=${this.topicToLocalConfig[requestId].devMode ? "1" : "0"}`
  }

  /**
   * @notice Returns the URL of the request.
   * @param requestId The request ID.
   * @returns The URL of the request.
   */
  public getUrl(requestId: string) {
    return this._getUrl(requestId)
  }

  /**
   * @notice Cancels a request by closing the WebSocket connection and deleting the associated data.
   * @param requestId The request ID.
   */
  public cancelRequest(requestId: string) {
    if (this.topicToBridge[requestId]) {
      this.topicToBridge[requestId].close()
      delete this.topicToBridge[requestId]
    }
    delete this.topicToPublicKey[requestId]
    delete this.topicToConfig[requestId]
    delete this.topicToLocalConfig[requestId]
    delete this.topicToProofs[requestId]
    delete this.topicToFailedProofCount[requestId]
    delete this.topicToResults[requestId]
    this.onRequestReceivedCallbacks[requestId] = []
    this.onGeneratingProofCallbacks[requestId] = []
    this.onBridgeConnectCallbacks[requestId] = []
    this.onProofGeneratedCallbacks[requestId] = []
    this.onRejectCallbacks[requestId] = []
    this.onErrorCallbacks[requestId] = []
  }

  /**
   * @notice Clears all requests.
   */
  public clearAllRequests() {
    for (const requestId in this.topicToBridge) {
      this.cancelRequest(requestId)
    }
  }
}
