import { randomBytes } from "crypto"
import { Alpha3Code, getAlpha3Code, registerLocale } from "i18n-iso-countries"
import {
  type DisclosableIDCredential,
  type IDCredential,
  type IDCredentialConfig,
  type IDCredentialValue,
  type NumericalIDCredential,
  type ProofResult,
  type QueryResult,
  type CountryName,
  type JsonRpcRequest,
  getProofData,
  getCommitmentFromDSCProof,
  getCommitmentInFromIDDataProof,
  getCommitmentOutFromIDDataProof,
  getNullifierFromDisclosureProof,
  getCommitmentInFromIntegrityProof,
  getCommitmentOutFromIntegrityProof,
  getCommitmentInFromDisclosureProof,
  getMerkleRootFromDSCProof,
  getCurrentDateFromIntegrityProof,
  getMaxAgeFromProof,
  getMinAgeFromProof,
  getCurrentDateFromAgeProof,
  getMinDateFromProof,
  getMaxDateFromProof,
  getCountryListFromExclusionProof,
  getCountryListFromInclusionProof,
  DisclosedData,
  formatName,
  getHostedPackagedCircuitByName,
  Query,
} from "@zkpassport/utils"
import { bytesToHex } from "@noble/ciphers/utils"
import { getWebSocketClient, WebSocketClient } from "./websocket"
import { createEncryptedJsonRpcRequest } from "./json-rpc"
import { decrypt, generateECDHKeyPair, getSharedSecret } from "./encryption"
import { noLogger as logger } from "./logger"
import { inflate } from "pako"
import i18en from "i18n-iso-countries/langs/en.json"
import { Buffer } from "buffer/"

// If Buffer is not defined, then we use the Buffer from the buffer package
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer as any
  if (typeof window !== "undefined") {
    window.Buffer = Buffer as any
  }
}

export type QueryResultError<T> = {
  expected?: T
  received?: T
  message: string
}

export type QueryResultErrors = {
  [key in
    | IDCredential
    | "sig_check_dsc"
    | "sig_check_id_data"
    | "data_check_integrity"
    | "disclose"]: {
    disclose?: QueryResultError<string | number | Date>
    gte?: QueryResultError<number | Date>
    lte?: QueryResultError<number | Date>
    lt?: QueryResultError<number | Date>
    range?: QueryResultError<[number | Date, number | Date]>
    in?: QueryResultError<string[]>
    out?: QueryResultError<string[]>
    eq?: QueryResultError<string | number | Date>
    commitment?: QueryResultError<string>
    date?: QueryResultError<string>
    certificate?: QueryResultError<string>
  }
}

registerLocale(i18en)

function hasRequestedAccessToField(credentialsRequest: Query, field: IDCredential): boolean {
  const fieldValue = credentialsRequest[field as keyof Query]
  const isDefined = fieldValue !== undefined && fieldValue !== null
  if (!isDefined) {
    return false
  }
  for (const key in fieldValue) {
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
  let normalizedCountry: Alpha3Code | undefined
  const alpha3 = getAlpha3Code(country, "en") as Alpha3Code | undefined
  normalizedCountry = alpha3 || (country as Alpha3Code)
  return normalizedCountry
}

function numericalCompare(
  fnName: "gte" | "gt" | "lte" | "lt",
  key: NumericalIDCredential,
  value: number | Date,
  requestId: string,
  requestIdToConfig: Record<string, Record<string, IDCredentialConfig>>,
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
  requestIdToConfig: Record<string, Record<string, IDCredentialConfig>>,
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
  requestIdToConfig: Record<string, Record<string, IDCredentialConfig>>,
) {
  requestIdToConfig[requestId][key] = {
    ...requestIdToConfig[requestId][key],
    [fnName]: value,
  }
}

export type * from "@zkpassport/utils"
export {
  SANCTIONED_COUNTRIES,
  EU_COUNTRIES,
  EEA_COUNTRIES,
  SCHENGEN_COUNTRIES,
  ASEAN_COUNTRIES,
  MERCOSUR_COUNTRIES,
} from "@zkpassport/utils"

export type QueryBuilderResult = {
  /**
   * The URL of the request.
   *
   * You can either encode the URL in a QR code or let the user click the link
   * to this URL on your website if they're visiting your website on their phone.
   */
  url: string
  /**
   * The id of the request.
   */
  requestId: string
  /**
   * Called when the user has scanned the QR code or clicked the link to the request.
   *
   * This means the user is currently viewing the request popup with your website information
   * and the information requested from them.
   */
  onRequestReceived: (callback: () => void) => void
  /**
   * Called when the user has accepted the request and
   * started to generate the proof on their phone.
   */
  onGeneratingProof: (callback: () => void) => void
  /**
   * Called when the SDK successfully connects to the bridge with the mobile app.
   */
  onBridgeConnect: (callback: () => void) => void
  /**
   * Called when the user has generated a proof.
   *
   * There is a minimum of 4 proofs, but there can be more depending
   * on the type of information requested from the user.
   */
  onProofGenerated: (callback: (proof: ProofResult) => void) => void
  /**
   * Called when the user has sent the query result.
   *
   * The response contains the unique identifier associated to the user,
   * your domain name and chosen scope, along with the query result and whether
   * the proofs were successfully verified.
   */
  onResult: (
    callback: (response: {
      uniqueIdentifier: string | undefined
      verified: boolean
      result: QueryResult
      queryResultErrors?: QueryResultErrors
    }) => void,
  ) => void
  /**
   * Called when the user has rejected the request.
   */
  onReject: (callback: () => void) => void
  /**
   * Called when an error occurs, such as one of the requirements not being met
   * or a proof failing to be generated.
   */
  onError: (callback: (error: string) => void) => void
  /**
   * @returns true if the bridge with the mobile app is connected
   */
  isBridgeConnected: () => boolean
  /**
   * Get if the user has scanned the QR code or the link to this request
   * @returns true if the request has been received by the user on their phone
   */
  requestReceived: () => boolean
}

export type QueryBuilder = {
  /**
   * Requires this attribute to be equal to the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  eq: <T extends IDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /**
   * Requires this attribute to be greater than or equal to the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  gte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /**
   * Requires this attribute to be less than or equal to the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  lte: <T extends "birthdate" | "expiry_date">(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /**
   * Requires this attribute to be less than the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  lt: <T extends "age">(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /**
   * Requires this attribute to be included in the provided range.
   * @param key The attribute to compare.
   * @param start The start of the range.
   * @param end The end of the range.
   */
  range: <T extends NumericalIDCredential>(
    key: T,
    start: IDCredentialValue<T>,
    end: IDCredentialValue<T>,
  ) => QueryBuilder
  /**
   * Requires this attribute to be included in the provided list.
   * @param key The attribute to compare.
   * @param value The list of values to check inclusion against.
   */
  in: <T extends "nationality" | "issuing_country">(
    key: T,
    value: IDCredentialValue<T>[],
  ) => QueryBuilder
  /**
   * Requires this attribute to be excluded from the provided list.
   * @param key The attribute to compare.
   * @param value The list of values to check exclusion against.
   */
  out: <T extends "nationality" | "issuing_country">(
    key: T,
    value: IDCredentialValue<T>[],
  ) => QueryBuilder
  /**
   * Requires this attribute to be disclosed.
   * @param key The attribute to disclose.
   */
  disclose: (key: DisclosableIDCredential) => QueryBuilder
  /**
   * Builds the request.
   *
   * This will return the URL of the request, which you can either encode in a QR code
   * or provide as a link to the user if they're visiting your website on their phone.
   * It also returns all the callbacks you can use to handle the user's response.
   */
  done: () => QueryBuilderResult
}

export class ZKPassport {
  private domain: string
  private topicToConfig: Record<string, Record<string, IDCredentialConfig>> = {}
  private topicToLocalConfig: Record<
    string,
    {
      validity: number
    }
  > = {}
  private topicToKeyPair: Record<string, { privateKey: Uint8Array; publicKey: Uint8Array }> = {}
  private topicToWebSocketClient: Record<string, WebSocketClient> = {}
  private topicToSharedSecret: Record<string, Uint8Array> = {}
  private topicToRequestReceived: Record<string, boolean> = {}
  private topicToService: Record<
    string,
    { name: string; logo: string; purpose: string; scope?: string }
  > = {}
  private topicToProofs: Record<string, Array<ProofResult>> = {}
  private topicToExpectedProofCount: Record<string, number> = {}
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
        queryResultErrors?: QueryResultErrors
      }) => void
    >
  > = {}
  private onRejectCallbacks: Record<string, Array<() => void>> = {}
  private onErrorCallbacks: Record<string, Array<(topic: string) => void>> = {}
  //private wasmVerifierInit: boolean = false

  constructor(_domain?: string) {
    if (!_domain && typeof window === "undefined") {
      throw new Error("Domain argument is required in Node.js environment")
    }
    this.domain = _domain || window.location.hostname
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
    delete this.topicToExpectedProofCount[topic]
    delete this.topicToFailedProofCount[topic]
  }

  private setExpectedProofCount(topic: string) {
    const fields = Object.keys(this.topicToConfig[topic] as Query).filter((key) =>
      hasRequestedAccessToField(this.topicToConfig[topic] as Query, key as IDCredential),
    )
    const neededCircuits: string[] = []
    // Determine which circuits are needed based on the requested fields
    for (const field of fields) {
      for (const key in this.topicToConfig[topic][field as IDCredential]) {
        switch (key) {
          case "eq":
          case "disclose":
            if (field !== "age" && !neededCircuits.includes("disclose_bytes")) {
              neededCircuits.push("disclose_bytes")
            } else if (field === "age" && !neededCircuits.includes("compare_age")) {
              neededCircuits.push("compare_age")
            }
            break
          case "gte":
          case "gt":
          case "lte":
          case "lt":
          case "range":
            if (field === "age" && !neededCircuits.includes("compare_age")) {
              neededCircuits.push("compare_age")
            } else if (field === "expiry_date" && !neededCircuits.includes("compare_expiry")) {
              neededCircuits.push("compare_expiry")
            } else if (field === "birthdate" && !neededCircuits.includes("compare_birthdate")) {
              neededCircuits.push("compare_birthdate")
            }
            break
          case "in":
            if (
              field === "nationality" &&
              !neededCircuits.includes("inclusion_check_nationality")
            ) {
              neededCircuits.push("inclusion_check_nationality")
            } else if (
              field === "issuing_country" &&
              !neededCircuits.includes("inclusion_check_issuing_country")
            ) {
              neededCircuits.push("inclusion_check_issuing_country")
            }
            break
          case "out":
            if (
              field === "nationality" &&
              !neededCircuits.includes("exclusion_check_nationality")
            ) {
              neededCircuits.push("exclusion_check_nationality")
            } else if (
              field === "issuing_country" &&
              !neededCircuits.includes("exclusion_check_issuing_country")
            ) {
              neededCircuits.push("exclusion_check_issuing_country")
            }
            break
        }
      }
    }
    // From the circuits needed, determine the expected proof count
    // There are at least 4 proofs, 3 base proofs and 1 disclosure proof minimum
    // Each separate needed circuit adds 1 disclosure proof
    this.topicToExpectedProofCount[topic] =
      neededCircuits.length === 0 ? 4 : 3 + neededCircuits.length
    this.topicToFailedProofCount[topic] = 0
  }

  /**
   * @notice Handle an encrypted message.
   * @param request The request.
   * @param outerRequest The outer request.
   */
  private async handleEncryptedMessage(
    topic: string,
    request: JsonRpcRequest,
    outerRequest: JsonRpcRequest,
  ) {
    logger.debug("Received encrypted message:", request)
    if (request.method === "accept") {
      logger.debug(`User accepted the request and is generating a proof`)
      await Promise.all(this.onGeneratingProofCallbacks[topic].map((callback) => callback(topic)))
    } else if (request.method === "reject") {
      logger.debug(`User rejected the request`)
      await Promise.all(this.onRejectCallbacks[topic].map((callback) => callback()))
    } else if (request.method === "proof") {
      logger.debug(`User generated proof`)
      // Uncompress the proof and convert it to a hex string
      const bytesProof = Buffer.from(request.params.proof, "base64")
      const uncompressedProof = inflate(bytesProof)
      // The gzip lib in the app compress the proof as ASCII
      // and since the app passes the proof as a hex string, we can
      // just decode the bytes as hex characters using the TextDecoder
      const hexProof = new TextDecoder().decode(uncompressedProof)
      const processedProof: ProofResult = {
        proof: hexProof,
        vkeyHash: request.params.vkeyHash,
        name: request.params.name,
        version: request.params.version,
      }
      this.topicToProofs[topic].push(processedProof)
      await Promise.all(
        this.onProofGeneratedCallbacks[topic].map((callback) => callback(processedProof)),
      )
      // If the results were received before all the proofs were generated,
      // we can handle the result now
      if (
        this.topicToResults[topic] &&
        this.topicToExpectedProofCount[topic] === this.topicToProofs[topic].length
      ) {
        await this.handleResult(topic)
      }
    } else if (request.method === "done") {
      logger.debug(`User sent the query result`)
      const formattedResult: QueryResult = request.params
      // Make sure to reconvert the dates to Date objects
      if (formattedResult.birthdate && formattedResult.birthdate.disclose) {
        formattedResult.birthdate.disclose.result = new Date(
          formattedResult.birthdate.disclose.result,
        )
      }
      if (formattedResult.expiry_date && formattedResult.expiry_date.disclose) {
        formattedResult.expiry_date.disclose.result = new Date(
          formattedResult.expiry_date.disclose.result,
        )
      }
      this.topicToResults[topic] = formattedResult
      // Make sure all the proofs have been received, otherwise we'll handle the result later
      // once the proofs have all been received
      if (this.topicToExpectedProofCount[topic] === this.topicToProofs[topic].length) {
        await this.handleResult(topic)
      }
    } else if (request.method === "error") {
      const error = request.params.error
      if (error && error === "This ID is not supported yet") {
        // This means the user has an ID that is not supported yet
        // So we won't receive any proofs and we can handle the result now
        this.topicToExpectedProofCount[topic] = 0
        this.topicToFailedProofCount[topic] += this.topicToExpectedProofCount[topic]
        if (this.topicToResults[topic]) {
          await this.handleResult(topic)
        }
      } else if (error && error.startsWith("Cannot generate proof")) {
        // This means one of the disclosure proofs failed to be generated
        // So we need to remove one from the expected proof count
        this.topicToExpectedProofCount[topic] -= 1
        this.topicToFailedProofCount[topic] += 1
        // If the expected proof count is now equal to the number of proofs received
        // and the results were received, we can handle the result now
        if (
          this.topicToResults[topic] &&
          this.topicToExpectedProofCount[topic] === this.topicToProofs[topic].length
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
        return this.getZkPassportRequest(topic)
      },
      /*gt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        numericalCompare('gt', key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },*/
      lte: <T extends "birthdate" | "expiry_date">(key: T, value: IDCredentialValue<T>) => {
        numericalCompare("lte", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      lt: <T extends "age">(key: T, value: IDCredentialValue<T>) => {
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
      done: () => {
        const base64Config = Buffer.from(JSON.stringify(this.topicToConfig[topic])).toString(
          "base64",
        )
        const base64Service = Buffer.from(JSON.stringify(this.topicToService[topic])).toString(
          "base64",
        )
        const pubkey = bytesToHex(this.topicToKeyPair[topic].publicKey)
        this.setExpectedProofCount(topic)
        return {
          url: `https://zkpassport.id/r?d=${this.domain}&t=${topic}&c=${base64Config}&s=${base64Service}&p=${pubkey}`,
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
              queryResultErrors?: QueryResultErrors
            }) => void,
          ) => this.onResultCallbacks[topic].push(callback),
          onReject: (callback: () => void) => this.onRejectCallbacks[topic].push(callback),
          onError: (callback: (error: string) => void) =>
            this.onErrorCallbacks[topic].push(callback),
          isBridgeConnected: () => this.topicToWebSocketClient[topic].readyState === WebSocket.OPEN,
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
   * @param validity How many days ago should have the ID been last scanned by the user?
   * @returns The query builder object.
   */
  public async request({
    name,
    logo,
    purpose,
    scope,
    validity,
    topicOverride,
    keyPairOverride,
  }: {
    name: string
    logo: string
    purpose: string
    scope?: string
    validity?: number
    topicOverride?: string
    keyPairOverride?: { privateKey: Uint8Array; publicKey: Uint8Array }
  }): Promise<QueryBuilder> {
    const topic = topicOverride || randomBytes(16).toString("hex")

    const keyPair = keyPairOverride || (await generateECDHKeyPair())
    this.topicToKeyPair[topic] = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    }

    this.topicToConfig[topic] = {}
    this.topicToService[topic] = { name, logo, purpose, scope }
    this.topicToProofs[topic] = []
    this.topicToExpectedProofCount[topic] = 0
    this.topicToLocalConfig[topic] = {
      // Default to 6 months
      validity: validity || 6 * 30,
    }

    this.onRequestReceivedCallbacks[topic] = []
    this.onGeneratingProofCallbacks[topic] = []
    this.onBridgeConnectCallbacks[topic] = []
    this.onProofGeneratedCallbacks[topic] = []
    this.onResultCallbacks[topic] = []
    this.onRejectCallbacks[topic] = []
    this.onErrorCallbacks[topic] = []

    const wsClient = getWebSocketClient(`wss://bridge.zkpassport.id?topic=${topic}`, this.domain)
    this.topicToWebSocketClient[topic] = wsClient
    wsClient.onopen = async () => {
      logger.info("[frontend] WebSocket connection established")
      await Promise.all(this.onBridgeConnectCallbacks[topic].map((callback) => callback()))
    }
    wsClient.addEventListener("message", async (event: any) => {
      logger.debug("[frontend] Received message:", event.data)
      try {
        const data: JsonRpcRequest = JSON.parse(event.data)
        // Handshake happens when the mobile app scans the QR code and connects to the bridge
        if (data.method === "handshake") {
          logger.debug("[frontend] Received handshake:", event.data)

          this.topicToRequestReceived[topic] = true
          this.topicToSharedSecret[topic] = await getSharedSecret(
            bytesToHex(keyPair.privateKey),
            data.params.pubkey,
          )
          logger.debug(
            "[frontend] Shared secret:",
            Buffer.from(this.topicToSharedSecret[topic]).toString("hex"),
          )

          const encryptedMessage = await createEncryptedJsonRpcRequest(
            "hello",
            null,
            this.topicToSharedSecret[topic],
            topic,
          )
          logger.debug("[frontend] Sending encrypted message:", encryptedMessage)
          wsClient.send(JSON.stringify(encryptedMessage))

          await Promise.all(this.onRequestReceivedCallbacks[topic].map((callback) => callback()))
          return
        }

        // Handle encrypted messages
        if (data.method === "encryptedMessage") {
          // Decode the payload from base64 to Uint8Array
          const payload = new Uint8Array(
            atob(data.params.payload)
              .split("")
              .map((c) => c.charCodeAt(0)),
          )
          try {
            // Decrypt the payload using the shared secret
            const decrypted = await decrypt(payload, this.topicToSharedSecret[topic], topic)
            const decryptedJson: JsonRpcRequest = JSON.parse(decrypted)
            this.handleEncryptedMessage(topic, decryptedJson, data)
          } catch (error) {
            logger.error("[frontend] Error decrypting message:", error)
          }
          return
        }
      } catch (error) {
        logger.error("[frontend] Error:", error)
      }
    })
    wsClient.onerror = (error: Event) => {
      logger.error("[frontend] WebSocket error:", error)
    }
    return this.getZkPassportRequest(topic)
  }

  private async checkPublicInputs(
    proofs: Array<ProofResult>,
    queryResult: QueryResult,
    validity?: number,
  ) {
    let commitmentIn: bigint | undefined
    let commitmentOut: bigint | undefined
    let isCorrect = true
    let uniqueIdentifier: string | undefined
    const VALID_CERTIFICATE_REGISTRY_ROOT = [
      BigInt("20192042006788880778219739574377003123593792072535937278552252195461520776494"),
      BigInt("21301853597069384763054217328384418971999152625381818922211526730996340553696"),
      BigInt("10839898448097753834842514286432152806152415606387598803678317315409344029817"),
    ]
    const defaultDateValue = new Date(1111, 10, 11)
    const currentTime = new Date()
    const today = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate(),
      0,
      0,
      0,
      0,
    )
    const queryResultErrors: QueryResultErrors = {
      sig_check_dsc: {},
      sig_check_id_data: {},
      data_check_integrity: {},
      disclose: {},
      age: {},
      birthdate: {},
      expiry_date: {},
      document_type: {},
      issuing_country: {},
      gender: {},
      nationality: {},
      firstname: {},
      lastname: {},
      fullname: {},
      document_number: {},
    }

    // Since the order is important for the commitments, we need to sort the proofs
    // by their expected order: root signature check -> ID signature check -> integrity check -> disclosure
    const sortedProofs = proofs.sort((a, b) => {
      const proofOrder = [
        "sig_check_dsc",
        "sig_check_id_data",
        "data_check_integrity",
        "disclose_bytes",
        "compare_age",
        "compare_birthdate",
        "compare_expiry",
        "exclusion_check_nationality",
        "inclusion_check_nationality",
        "exclusion_check_issuing_country",
        "inclusion_check_issuing_country",
      ]
      const getIndex = (proof: ProofResult) => {
        const name = proof.name || ""
        return proofOrder.findIndex((p) => name.startsWith(p))
      }
      return getIndex(a) - getIndex(b)
    })

    for (const proof of sortedProofs!) {
      const proofData = getProofData(proof.proof as string, true)
      if (proof.name?.startsWith("sig_check_dsc")) {
        commitmentOut = getCommitmentFromDSCProof(proofData)
        const merkleRoot = getMerkleRootFromDSCProof(proofData)
        if (!VALID_CERTIFICATE_REGISTRY_ROOT.includes(merkleRoot)) {
          console.warn("The ID was signed by an unrecognized root certificate")
          isCorrect = false
          queryResultErrors.sig_check_dsc.certificate = {
            expected: `Certificate registry root: ${VALID_CERTIFICATE_REGISTRY_ROOT.join(", ")}`,
            received: `Certificate registry root: ${merkleRoot.toString()}`,
            message: "The ID was signed by an unrecognized root certificate",
          }
        }
      } else if (proof.name?.startsWith("sig_check_id_data")) {
        commitmentIn = getCommitmentInFromIDDataProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the certificate signature and ID signature",
          )
          isCorrect = false
          queryResultErrors.sig_check_id_data.commitment = {
            expected: `Commitment: ${commitmentOut?.toString() || "undefined"}`,
            received: `Commitment: ${commitmentIn?.toString() || "undefined"}`,
            message: "Failed to check the link between the certificate signature and ID signature",
          }
        }
        commitmentOut = getCommitmentOutFromIDDataProof(proofData)
      } else if (proof.name?.startsWith("data_check_integrity")) {
        commitmentIn = getCommitmentInFromIntegrityProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn("Failed to check the link between the ID signature and the data signed")
          isCorrect = false
          queryResultErrors.data_check_integrity.commitment = {
            expected: `Commitment: ${commitmentOut?.toString() || "undefined"}`,
            received: `Commitment: ${commitmentIn?.toString() || "undefined"}`,
            message: "Failed to check the link between the ID signature and the data signed",
          }
        }
        commitmentOut = getCommitmentOutFromIntegrityProof(proofData)
        const currentDate = getCurrentDateFromIntegrityProof(proofData)
        const todayToCurrentDate = today.getTime() - currentDate.getTime()
        const differenceInDays = validity ?? 180
        const expectedDifference = differenceInDays * 86400000
        const actualDifference = today.getTime() - (today.getTime() - expectedDifference)
        // The ID should not expire within the next 6 months (or whatever the custom value is)
        if (todayToCurrentDate >= actualDifference) {
          console.warn(
            `The date used to check the validity of the ID is older than ${differenceInDays} days. You can ask the user to rescan their ID or ask them to disclose their expiry date`,
          )
          isCorrect = false
          queryResultErrors.data_check_integrity.date = {
            expected: `Difference: ${differenceInDays} days`,
            received: `Difference: ${Math.round(todayToCurrentDate / 86400000)} days`,
            message:
              "The date used to check the validity of the ID is older than the validity period",
          }
        }
      } else if (proof.name === "disclose_bytes") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the data to disclose",
          )
          isCorrect = false
          queryResultErrors.disclose.commitment = {
            expected: `Commitment: ${commitmentOut?.toString() || "undefined"}`,
            received: `Commitment: ${commitmentIn?.toString() || "undefined"}`,
            message:
              "Failed to check the link between the validity of the ID and the data to disclose",
          }
        }
        // We can't be certain that the disclosed data is for a passport or an ID card
        // so we need to check both (unless the document type is revealed)
        const disclosedDataPassport = DisclosedData.fromBytesProof(proofData, "passport")
        const disclosedDataIDCard = DisclosedData.fromBytesProof(proofData, "id_card")
        if (queryResult.document_type) {
          // Document type is always at the same index in the disclosed data
          if (
            queryResult.document_type.eq &&
            queryResult.document_type.eq.result &&
            queryResult.document_type.eq.expected !== disclosedDataPassport.documentType
          ) {
            console.warn("Document type does not match the expected document type")
            isCorrect = false
            queryResultErrors.document_type.eq = {
              expected: `${queryResult.document_type.eq.expected}`,
              received: `${disclosedDataPassport.documentType ?? disclosedDataIDCard.documentType}`,
              message: "Document type does not match the expected document type",
            }
          }
          if (queryResult.document_type.disclose?.result !== disclosedDataIDCard.documentType) {
            console.warn("Document type does not match the disclosed document type in query result")
            isCorrect = false
            queryResultErrors.document_type.disclose = {
              expected: `${queryResult.document_type.disclose?.result}`,
              received: `${disclosedDataIDCard.documentType ?? disclosedDataPassport.documentType}`,
              message: "Document type does not match the disclosed document type in query result",
            }
          }
        }
        if (queryResult.birthdate) {
          const birthdatePassport = disclosedDataPassport.dateOfBirth
          const birthdateIDCard = disclosedDataIDCard.dateOfBirth
          if (
            queryResult.birthdate.eq &&
            queryResult.birthdate.eq.result &&
            queryResult.birthdate.eq.expected.getTime() !== birthdatePassport.getTime() &&
            queryResult.birthdate.eq.expected.getTime() !== birthdateIDCard.getTime()
          ) {
            console.warn("Birthdate does not match the expected birthdate")
            isCorrect = false
            queryResultErrors.birthdate.eq = {
              expected: `${queryResult.birthdate.eq.expected.toISOString()}`,
              received: `${birthdatePassport?.toISOString() ?? birthdateIDCard?.toISOString()}`,
              message: "Birthdate does not match the expected birthdate",
            }
          }
          if (
            queryResult.birthdate.disclose &&
            queryResult.birthdate.disclose.result.getTime() !== birthdatePassport.getTime() &&
            queryResult.birthdate.disclose.result.getTime() !== birthdateIDCard.getTime()
          ) {
            console.warn("Birthdate does not match the disclosed birthdate in query result")
            isCorrect = false
            queryResultErrors.birthdate.disclose = {
              expected: `${queryResult.birthdate.disclose.result.toISOString()}`,
              received: `${birthdatePassport?.toISOString() ?? birthdateIDCard?.toISOString()}`,
              message: "Birthdate does not match the disclosed birthdate in query result",
            }
          }
        }
        if (queryResult.expiry_date) {
          const expiryDatePassport = disclosedDataPassport.dateOfExpiry
          const expiryDateIDCard = disclosedDataIDCard.dateOfExpiry
          if (
            queryResult.expiry_date.eq &&
            queryResult.expiry_date.eq.result &&
            queryResult.expiry_date.eq.expected.getTime() !== expiryDatePassport.getTime() &&
            queryResult.expiry_date.eq.expected.getTime() !== expiryDateIDCard.getTime()
          ) {
            console.warn("Expiry date does not match the expected expiry date")
            isCorrect = false
            queryResultErrors.expiry_date.eq = {
              expected: `${queryResult.expiry_date.eq.expected.toISOString()}`,
              received: `${expiryDatePassport?.toISOString() ?? expiryDateIDCard?.toISOString()}`,
              message: "Expiry date does not match the expected expiry date",
            }
          }
          if (
            queryResult.expiry_date.disclose &&
            queryResult.expiry_date.disclose.result.getTime() !== expiryDatePassport.getTime() &&
            queryResult.expiry_date.disclose.result.getTime() !== expiryDateIDCard.getTime()
          ) {
            console.warn("Expiry date does not match the disclosed expiry date in query result")
            isCorrect = false
            queryResultErrors.expiry_date.disclose = {
              expected: `${queryResult.expiry_date.disclose.result.toISOString()}`,
              received: `${expiryDatePassport?.toISOString() ?? expiryDateIDCard?.toISOString()}`,
              message: "Expiry date does not match the disclosed expiry date in query result",
            }
          }
        }
        if (queryResult.nationality) {
          const nationalityPassport = disclosedDataPassport.nationality
          const nationalityIDCard = disclosedDataIDCard.nationality
          if (
            queryResult.nationality.eq &&
            queryResult.nationality.eq.result &&
            queryResult.nationality.eq.expected !== nationalityPassport &&
            queryResult.nationality.eq.expected !== nationalityIDCard
          ) {
            console.warn("Nationality does not match the expected nationality")
            isCorrect = false
            queryResultErrors.nationality.eq = {
              expected: `${queryResult.nationality.eq.expected}`,
              received: `${nationalityPassport ?? nationalityIDCard}`,
              message: "Nationality does not match the expected nationality",
            }
          }
          if (
            queryResult.nationality.disclose &&
            queryResult.nationality.disclose.result !== nationalityPassport &&
            queryResult.nationality.disclose.result !== nationalityIDCard
          ) {
            console.warn("Nationality does not match the disclosed nationality in query result")
            isCorrect = false
            queryResultErrors.nationality.disclose = {
              expected: `${queryResult.nationality.disclose.result}`,
              received: `${nationalityPassport ?? nationalityIDCard}`,
              message: "Nationality does not match the disclosed nationality in query result",
            }
          }
        }
        if (queryResult.document_number) {
          const documentNumberPassport = disclosedDataPassport.documentNumber
          const documentNumberIDCard = disclosedDataIDCard.documentNumber
          if (
            queryResult.document_number.eq &&
            queryResult.document_number.eq.result &&
            queryResult.document_number.eq.expected !== documentNumberPassport &&
            queryResult.document_number.eq.expected !== documentNumberIDCard
          ) {
            console.warn("Document number does not match the expected document number")
            isCorrect = false
            queryResultErrors.document_number.eq = {
              expected: `${queryResult.document_number.eq.expected}`,
              received: `${documentNumberPassport ?? documentNumberIDCard}`,
              message: "Document number does not match the expected document number",
            }
          }
          if (
            queryResult.document_number.disclose &&
            queryResult.document_number.disclose.result !== documentNumberPassport &&
            queryResult.document_number.disclose.result !== documentNumberIDCard
          ) {
            console.warn(
              "Document number does not match the disclosed document number in query result",
            )
            isCorrect = false
            queryResultErrors.document_number.disclose = {
              expected: `${queryResult.document_number.disclose.result}`,
              received: `${documentNumberPassport ?? documentNumberIDCard}`,
              message:
                "Document number does not match the disclosed document number in query result",
            }
          }
        }
        if (queryResult.gender) {
          const genderPassport = disclosedDataPassport.gender
          const genderIDCard = disclosedDataIDCard.gender
          if (
            queryResult.gender.eq &&
            queryResult.gender.eq.result &&
            queryResult.gender.eq.expected !== genderPassport &&
            queryResult.gender.eq.expected !== genderIDCard
          ) {
            console.warn("Gender does not match the expected gender")
            isCorrect = false
            queryResultErrors.gender.eq = {
              expected: `${queryResult.gender.eq.expected}`,
              received: `${genderPassport ?? genderIDCard}`,
              message: "Gender does not match the expected gender",
            }
          }
          if (
            queryResult.gender.disclose &&
            queryResult.gender.disclose.result !== genderPassport &&
            queryResult.gender.disclose.result !== genderIDCard
          ) {
            console.warn("Gender does not match the disclosed gender in query result")
            isCorrect = false
            queryResultErrors.gender.disclose = {
              expected: `${queryResult.gender.disclose.result}`,
              received: `${genderPassport ?? genderIDCard}`,
              message: "Gender does not match the disclosed gender in query result",
            }
          }
        }
        if (queryResult.issuing_country) {
          const issuingCountryPassport = disclosedDataPassport.issuingCountry
          const issuingCountryIDCard = disclosedDataIDCard.issuingCountry
          if (
            queryResult.issuing_country.eq &&
            queryResult.issuing_country.eq.result &&
            queryResult.issuing_country.eq.expected !== issuingCountryPassport &&
            queryResult.issuing_country.eq.expected !== issuingCountryIDCard
          ) {
            console.warn("Issuing country does not match the expected issuing country")
            isCorrect = false
            queryResultErrors.issuing_country.eq = {
              expected: `${queryResult.issuing_country.eq.expected}`,
              received: `${issuingCountryPassport ?? issuingCountryIDCard}`,
              message: "Issuing country does not match the expected issuing country",
            }
          }
          if (
            queryResult.issuing_country.disclose &&
            queryResult.issuing_country.disclose.result !== issuingCountryPassport &&
            queryResult.issuing_country.disclose.result !== issuingCountryIDCard
          ) {
            console.warn(
              "Issuing country does not match the disclosed issuing country in query result",
            )
            isCorrect = false
            queryResultErrors.issuing_country.disclose = {
              expected: `${queryResult.issuing_country.disclose.result}`,
              received: `${issuingCountryPassport ?? issuingCountryIDCard}`,
              message:
                "Issuing country does not match the disclosed issuing country in query result",
            }
          }
        }
        if (queryResult.fullname) {
          const fullnamePassport = disclosedDataPassport.name
          const fullnameIDCard = disclosedDataIDCard.name
          if (
            queryResult.fullname.eq &&
            queryResult.fullname.eq.result &&
            formatName(queryResult.fullname.eq.expected).toLowerCase() !==
              fullnamePassport.toLowerCase() &&
            formatName(queryResult.fullname.eq.expected).toLowerCase() !==
              fullnameIDCard.toLowerCase()
          ) {
            console.warn("Fullname does not match the expected fullname")
            isCorrect = false
            queryResultErrors.fullname.eq = {
              expected: `${queryResult.fullname.eq.expected}`,
              received: `${fullnamePassport ?? fullnameIDCard}`,
              message: "Fullname does not match the expected fullname",
            }
          }
          if (
            queryResult.fullname.disclose &&
            formatName(queryResult.fullname.disclose.result).toLowerCase() !==
              fullnamePassport.toLowerCase() &&
            formatName(queryResult.fullname.disclose.result).toLowerCase() !==
              fullnameIDCard.toLowerCase()
          ) {
            console.warn("Fullname does not match the disclosed fullname in query result")
            isCorrect = false
            queryResultErrors.fullname.disclose = {
              expected: `${queryResult.fullname.disclose.result}`,
              received: `${fullnamePassport ?? fullnameIDCard}`,
              message: "Fullname does not match the disclosed fullname in query result",
            }
          }
        }
        if (queryResult.firstname) {
          // If fullname was not revealed, then the name could be either the first name or last name
          const firstnamePassport =
            disclosedDataPassport.firstName && disclosedDataPassport.firstName.length > 0
              ? disclosedDataPassport.firstName
              : disclosedDataPassport.name
          const firstnameIDCard =
            disclosedDataIDCard.firstName && disclosedDataIDCard.firstName.length > 0
              ? disclosedDataIDCard.firstName
              : disclosedDataIDCard.name
          if (
            queryResult.firstname.eq &&
            queryResult.firstname.eq.result &&
            formatName(queryResult.firstname.eq.expected).toLowerCase() !==
              firstnamePassport.toLowerCase() &&
            formatName(queryResult.firstname.eq.expected).toLowerCase() !==
              firstnameIDCard.toLowerCase()
          ) {
            console.warn("Firstname does not match the expected firstname")
            isCorrect = false
            queryResultErrors.firstname.eq = {
              expected: `${queryResult.firstname.eq.expected}`,
              received: `${firstnamePassport ?? firstnameIDCard}`,
              message: "Firstname does not match the expected firstname",
            }
          }
          if (
            queryResult.firstname.disclose &&
            formatName(queryResult.firstname.disclose.result).toLowerCase() !==
              firstnamePassport.toLowerCase() &&
            formatName(queryResult.firstname.disclose.result).toLowerCase() !==
              firstnameIDCard.toLowerCase()
          ) {
            console.warn("Firstname does not match the disclosed firstname in query result")
            isCorrect = false
            queryResultErrors.firstname.disclose = {
              expected: `${queryResult.firstname.disclose.result}`,
              received: `${firstnamePassport ?? firstnameIDCard}`,
              message: "Firstname does not match the disclosed firstname in query result",
            }
          }
        }
        if (queryResult.lastname) {
          // If fullname was not revealed, then the name could be either the first name or last name
          const lastnamePassport =
            disclosedDataPassport.lastName && disclosedDataPassport.lastName.length > 0
              ? disclosedDataPassport.lastName
              : disclosedDataPassport.name
          const lastnameIDCard =
            disclosedDataIDCard.lastName && disclosedDataIDCard.lastName.length > 0
              ? disclosedDataIDCard.lastName
              : disclosedDataIDCard.name
          if (
            queryResult.lastname.eq &&
            queryResult.lastname.eq.result &&
            formatName(queryResult.lastname.eq.expected).toLowerCase() !==
              lastnamePassport.toLowerCase() &&
            formatName(queryResult.lastname.eq.expected).toLowerCase() !==
              lastnameIDCard.toLowerCase()
          ) {
            console.warn("Lastname does not match the expected lastname")
            isCorrect = false
            queryResultErrors.lastname.eq = {
              expected: `${queryResult.lastname.eq.expected}`,
              received: `${lastnamePassport ?? lastnameIDCard}`,
              message: "Lastname does not match the expected lastname",
            }
          }
          if (
            queryResult.lastname.disclose &&
            formatName(queryResult.lastname.disclose.result).toLowerCase() !==
              lastnamePassport.toLowerCase() &&
            formatName(queryResult.lastname.disclose.result).toLowerCase() !==
              lastnameIDCard.toLowerCase()
          ) {
            console.warn("Lastname does not match the disclosed lastname in query result")
            isCorrect = false
            queryResultErrors.lastname.disclose = {
              expected: `${queryResult.lastname.disclose.result}`,
              received: `${lastnamePassport ?? lastnameIDCard}`,
              message: "Lastname does not match the disclosed lastname in query result",
            }
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "compare_age") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the age derived from it",
          )
          isCorrect = false
          queryResultErrors.age.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message:
              "Failed to check the link between the validity of the ID and the age derived from it",
          }
        }
        const minAge = getMinAgeFromProof(proofData)
        const maxAge = getMaxAgeFromProof(proofData)
        if (queryResult.age) {
          if (
            queryResult.age.gte &&
            queryResult.age.gte.result &&
            minAge < (queryResult.age.gte.expected as number)
          ) {
            console.warn("Age is not greater than or equal to the expected age")
            isCorrect = false
            queryResultErrors.age.gte = {
              expected: queryResult.age.gte.expected,
              received: minAge,
              message: "Age is not greater than or equal to the expected age",
            }
          }
          if (
            queryResult.age.lt &&
            queryResult.age.lt.result &&
            maxAge >= (queryResult.age.lt.expected as number)
          ) {
            console.warn("Age is not less than the expected age")
            isCorrect = false
            queryResultErrors.age.lt = {
              expected: queryResult.age.lt.expected,
              received: maxAge,
              message: "Age is not less than the expected age",
            }
          }
          if (queryResult.age.range) {
            if (
              queryResult.age.range.result &&
              (minAge < (queryResult.age.range.expected[0] as number) ||
                maxAge >= (queryResult.age.range.expected[1] as number))
            ) {
              console.warn("Age is not in the expected range")
              isCorrect = false
              queryResultErrors.age.range = {
                expected: queryResult.age.range.expected,
                received: [minAge, maxAge],
                message: "Age is not in the expected range",
              }
            }
          }
          if (!queryResult.age.lt && !queryResult.age.range && maxAge != 0) {
            console.warn("Maximum age should be equal to 0")
            isCorrect = false
            queryResultErrors.age.disclose = {
              expected: 0,
              received: maxAge,
              message: "Maximum age should be equal to 0",
            }
          }
          if (!queryResult.age.gte && !queryResult.age.range && minAge != 0) {
            console.warn("Minimum age should be equal to 0")
            isCorrect = false
            queryResultErrors.age.disclose = {
              expected: 0,
              received: minAge,
              message: "Minimum age should be equal to 0",
            }
          }
          if (
            queryResult.age.disclose &&
            (queryResult.age.disclose.result !== minAge ||
              queryResult.age.disclose.result !== maxAge)
          ) {
            console.warn("Age does not match the disclosed age in query result")
            isCorrect = false
            queryResultErrors.age.disclose = {
              expected: `${minAge}`,
              received: `${queryResult.age.disclose.result}`,
              message: "Age does not match the disclosed age in query result",
            }
          }
        } else {
          console.warn("Age is not set in the query result")
          isCorrect = false
          queryResultErrors.age.disclose = {
            message: "Age is not set in the query result",
          }
        }
        const currentDate = getCurrentDateFromAgeProof(proofData)
        if (
          currentDate.getTime() !== today.getTime() &&
          currentDate.getTime() !== today.getTime() - 86400000
        ) {
          console.warn("Current date in the proof is too old")
          isCorrect = false
          queryResultErrors.age.disclose = {
            expected: `${today.toISOString()}`,
            received: `${currentDate.toISOString()}`,
            message: "Current date in the proof is too old",
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "compare_birthdate") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the birthdate derived from it",
          )
          isCorrect = false
          queryResultErrors.birthdate.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message:
              "Failed to check the link between the validity of the ID and the birthdate derived from it",
          }
        }
        const minDate = getMinDateFromProof(proofData)
        const maxDate = getMaxDateFromProof(proofData)
        if (queryResult.birthdate) {
          if (
            queryResult.birthdate.gte &&
            queryResult.birthdate.gte.result &&
            minDate < queryResult.birthdate.gte.expected
          ) {
            console.warn("Birthdate is not greater than or equal to the expected birthdate")
            isCorrect = false
            queryResultErrors.birthdate.gte = {
              expected: queryResult.birthdate.gte.expected,
              received: minDate,
              message: "Birthdate is not greater than or equal to the expected birthdate",
            }
          }
          if (
            queryResult.birthdate.lte &&
            queryResult.birthdate.lte.result &&
            maxDate > queryResult.birthdate.lte.expected
          ) {
            console.warn("Birthdate is not less than the expected birthdate")
            isCorrect = false
            queryResultErrors.birthdate.lte = {
              expected: queryResult.birthdate.lte.expected,
              received: maxDate,
              message: "Birthdate is not less than the expected birthdate",
            }
          }
          if (queryResult.birthdate.range) {
            if (
              queryResult.birthdate.range.result &&
              (minDate < queryResult.birthdate.range.expected[0] ||
                maxDate > queryResult.birthdate.range.expected[1])
            ) {
              console.warn("Birthdate is not in the expected range")
              isCorrect = false
              queryResultErrors.birthdate.range = {
                expected: queryResult.birthdate.range.expected,
                received: [minDate, maxDate],
                message: "Birthdate is not in the expected range",
              }
            }
          }
          if (
            !queryResult.birthdate.lte &&
            !queryResult.birthdate.range &&
            maxDate.getTime() != defaultDateValue.getTime()
          ) {
            console.warn("Maximum birthdate should be equal to default date value")
            isCorrect = false
            queryResultErrors.birthdate.disclose = {
              expected: `${defaultDateValue.toISOString()}`,
              received: `${maxDate.toISOString()}`,
              message: "Maximum birthdate should be equal to default date value",
            }
          }
          if (
            !queryResult.birthdate.gte &&
            !queryResult.birthdate.range &&
            minDate.getTime() != defaultDateValue.getTime()
          ) {
            console.warn("Minimum birthdate should be equal to default date value")
            isCorrect = false
            queryResultErrors.birthdate.disclose = {
              expected: `${defaultDateValue.toISOString()}`,
              received: `${minDate.toISOString()}`,
              message: "Minimum birthdate should be equal to default date value",
            }
          }
        } else {
          console.warn("Birthdate is not set in the query result")
          isCorrect = false
          queryResultErrors.birthdate.disclose = {
            message: "Birthdate is not set in the query result",
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "compare_expiry") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and its expiry date",
          )
          isCorrect = false
          queryResultErrors.expiry_date.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message: "Failed to check the link between the validity of the ID and its expiry date",
          }
        }
        const minDate = getMinDateFromProof(proofData)
        const maxDate = getMaxDateFromProof(proofData)
        if (queryResult.expiry_date) {
          if (
            queryResult.expiry_date.gte &&
            queryResult.expiry_date.gte.result &&
            minDate < queryResult.expiry_date.gte.expected
          ) {
            console.warn("Expiry date is not greater than or equal to the expected expiry date")
            isCorrect = false
            queryResultErrors.expiry_date.gte = {
              expected: queryResult.expiry_date.gte.expected,
              received: minDate,
              message: "Expiry date is not greater than or equal to the expected expiry date",
            }
          }
          if (
            queryResult.expiry_date.lte &&
            queryResult.expiry_date.lte.result &&
            maxDate > queryResult.expiry_date.lte.expected
          ) {
            console.warn("Expiry date is not less than the expected expiry date")
            isCorrect = false
            queryResultErrors.expiry_date.lte = {
              expected: queryResult.expiry_date.lte.expected,
              received: maxDate,
              message: "Expiry date is not less than the expected expiry date",
            }
          }
          if (queryResult.expiry_date.range) {
            if (
              queryResult.expiry_date.range.result &&
              (minDate < queryResult.expiry_date.range.expected[0] ||
                maxDate > queryResult.expiry_date.range.expected[1])
            ) {
              console.warn("Expiry date is not in the expected range")
              isCorrect = false
              queryResultErrors.expiry_date.range = {
                expected: queryResult.expiry_date.range.expected,
                received: [minDate, maxDate],
                message: "Expiry date is not in the expected range",
              }
            }
          }
          if (
            !queryResult.expiry_date.lte &&
            !queryResult.expiry_date.range &&
            maxDate.getTime() != defaultDateValue.getTime()
          ) {
            console.warn("Maximum expiry date should be equal to default date value")
            isCorrect = false
            queryResultErrors.expiry_date.disclose = {
              expected: `${defaultDateValue.toISOString()}`,
              received: `${maxDate.toISOString()}`,
              message: "Maximum expiry date should be equal to default date value",
            }
          }
          if (
            !queryResult.expiry_date.gte &&
            !queryResult.expiry_date.range &&
            minDate.getTime() != defaultDateValue.getTime()
          ) {
            console.warn("Minimum expiry date should be equal to default date value")
            isCorrect = false
            queryResultErrors.expiry_date.disclose = {
              expected: `${defaultDateValue.toISOString()}`,
              received: `${minDate.toISOString()}`,
              message: "Minimum expiry date should be equal to default date value",
            }
          }
        } else {
          console.warn("Expiry date is not set in the query result")
          isCorrect = false
          queryResultErrors.expiry_date.disclose = {
            message: "Expiry date is not set in the query result",
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "exclusion_check_nationality") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the nationality exclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message:
              "Failed to check the link between the validity of the ID and the nationality exclusion check",
          }
        }
        const countryList = getCountryListFromExclusionProof(proofData)
        if (
          queryResult.nationality &&
          queryResult.nationality.out &&
          queryResult.nationality.out.result
        ) {
          if (
            !queryResult.nationality.out.expected?.every((country) => countryList.includes(country))
          ) {
            console.warn("Nationality exclusion list does not match the one from the query results")
            isCorrect = false
            queryResultErrors.nationality.out = {
              expected: queryResult.nationality.out.expected,
              received: countryList,
              message: "Nationality exclusion list does not match the one from the query results",
            }
          }
        } else if (!queryResult.nationality || !queryResult.nationality.out) {
          console.warn("Nationality exclusion is not set in the query result")
          isCorrect = false
          queryResultErrors.nationality.out = {
            message: "Nationality exclusion is not set in the query result",
          }
        }
        // Check the countryList is in ascending order
        // If the prover doesn't use a sorted list then the proof cannot be trusted
        // as it is requirement in the circuit for the exclusion check to work
        for (let i = 1; i < countryList.length; i++) {
          if (countryList[i] < countryList[i - 1]) {
            console.warn(
              "The nationality exclusion list has not been sorted, and thus the proof cannot be trusted",
            )
            isCorrect = false
            queryResultErrors.nationality.out = {
              message:
                "The nationality exclusion list has not been sorted, and thus the proof cannot be trusted",
            }
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "exclusion_check_issuing_country") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the issuing country exclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message:
              "Failed to check the link between the validity of the ID and the issuing country exclusion check",
          }
        }
        const countryList = getCountryListFromExclusionProof(proofData)
        if (
          queryResult.issuing_country &&
          queryResult.issuing_country.out &&
          queryResult.issuing_country.out.result
        ) {
          if (
            !queryResult.issuing_country.out.expected?.every((country) =>
              countryList.includes(country),
            )
          ) {
            console.warn(
              "Issuing country exclusion list does not match the one from the query results",
            )
            isCorrect = false
            queryResultErrors.issuing_country.out = {
              expected: queryResult.issuing_country.out.expected,
              received: countryList,
              message:
                "Issuing country exclusion list does not match the one from the query results",
            }
          }
        } else if (!queryResult.issuing_country || !queryResult.issuing_country.out) {
          console.warn("Issuing country exclusion is not set in the query result")
          isCorrect = false
          queryResultErrors.issuing_country.out = {
            message: "Issuing country exclusion is not set in the query result",
          }
        }
        // Check the countryList is in ascending order
        // If the prover doesn't use a sorted list then the proof cannot be trusted
        // as it is requirement in the circuit for the exclusion check to work
        for (let i = 1; i < countryList.length; i++) {
          if (countryList[i] < countryList[i - 1]) {
            console.warn(
              "The issuing country exclusion list has not been sorted, and thus the proof cannot be trusted",
            )
            isCorrect = false
            queryResultErrors.issuing_country.out = {
              message:
                "The issuing country exclusion list has not been sorted, and thus the proof cannot be trusted",
            }
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "inclusion_check_nationality") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the nationality inclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message:
              "Failed to check the link between the validity of the ID and the nationality inclusion check",
          }
        }
        const countryList = getCountryListFromInclusionProof(proofData)
        if (
          queryResult.nationality &&
          queryResult.nationality.in &&
          queryResult.nationality.in.result
        ) {
          if (
            !queryResult.nationality.in.expected?.every((country) => countryList.includes(country))
          ) {
            console.warn("Nationality inclusion list does not match the one from the query results")
            isCorrect = false
            queryResultErrors.nationality.in = {
              expected: queryResult.nationality.in.expected,
              received: countryList,
              message: "Nationality inclusion list does not match the one from the query results",
            }
          }
        } else if (!queryResult.nationality || !queryResult.nationality.in) {
          console.warn("Nationality inclusion is not set in the query result")
          isCorrect = false
          queryResultErrors.nationality.in = {
            message: "Nationality inclusion is not set in the query result",
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      } else if (proof.name === "inclusion_check_issuing_country") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the issuing country inclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality.commitment = {
            expected: `Commitment: ${commitmentOut}`,
            received: `Commitment: ${commitmentIn}`,
            message:
              "Failed to check the link between the validity of the ID and the issuing country inclusion check",
          }
        }
        const countryList = getCountryListFromInclusionProof(proofData)
        if (
          queryResult.issuing_country &&
          queryResult.issuing_country.in &&
          queryResult.issuing_country.in.result
        ) {
          if (
            !queryResult.issuing_country.in.expected?.every((country) =>
              countryList.includes(country),
            )
          ) {
            console.warn(
              "Issuing country inclusion list does not match the one from the query results",
            )
            isCorrect = false
            queryResultErrors.issuing_country.in = {
              expected: queryResult.issuing_country.in.expected,
              received: countryList,
              message:
                "Issuing country inclusion list does not match the one from the query results",
            }
          }
        } else if (!queryResult.issuing_country || !queryResult.issuing_country.in) {
          console.warn("Issuing country inclusion is not set in the query result")
          isCorrect = false
          queryResultErrors.issuing_country.in = {
            message: "Issuing country inclusion is not set in the query result",
          }
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
      }
    }
    return { isCorrect, uniqueIdentifier, queryResultErrors }
  }

  /**
   * @notice Verify the proofs received from the mobile app.
   * @param proofs The proofs to verify.
   * @param queryResult The query result to verify against
   * @param validity How many days ago should have the ID been last scanned by the user?
   * @returns An object containing the unique identifier associated to the user
   * and a boolean indicating whether the proofs were successfully verified.
   */
  public async verify({
    proofs,
    queryResult,
    validity,
  }: {
    proofs: Array<ProofResult>
    queryResult: QueryResult
    validity?: number
  }): Promise<{
    uniqueIdentifier: string | undefined
    verified: boolean
    queryResultErrors?: QueryResultErrors
  }> {
    const formattedResult: QueryResult = queryResult
    // Make sure to reconvert the dates to Date objects
    if (formattedResult.birthdate && formattedResult.birthdate.disclose) {
      formattedResult.birthdate.disclose.result = new Date(
        formattedResult.birthdate.disclose.result,
      )
    }
    if (formattedResult.expiry_date && formattedResult.expiry_date.disclose) {
      formattedResult.expiry_date.disclose.result = new Date(
        formattedResult.expiry_date.disclose.result,
      )
    }

    const { BarretenbergVerifier } = await import("@aztec/bb.js")
    const verifier = new BarretenbergVerifier()
    let verified = true
    let uniqueIdentifier: string | undefined
    let queryResultErrors: QueryResultErrors | undefined
    const {
      isCorrect,
      uniqueIdentifier: uniqueIdentifierFromPublicInputs,
      queryResultErrors: queryResultErrorsFromPublicInputs,
    } = await this.checkPublicInputs(proofs, formattedResult, validity)
    uniqueIdentifier = uniqueIdentifierFromPublicInputs
    verified = isCorrect
    queryResultErrors = isCorrect ? undefined : queryResultErrorsFromPublicInputs
    // Only proceed with the proof verification if the public inputs are correct
    if (verified) {
      for (const proof of proofs) {
        const proofData = getProofData(proof.proof as string, true)
        const hostedPackagedCircuit = await getHostedPackagedCircuitByName(
          proof.version as any,
          proof.name!,
        )
        const vkeyBytes = Buffer.from(hostedPackagedCircuit.vkey, "base64")
        try {
          verified = await verifier.verifyUltraHonkProof(proofData, new Uint8Array(vkeyBytes))
        } catch (e) {
          console.warn("Error verifying proof", e)
          verified = false
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
    return { uniqueIdentifier, verified, queryResultErrors }
  }

  /**
   * @notice Returns the URL of the request.
   * @param requestId The request ID.
   * @returns The URL of the request.
   */
  public getUrl(requestId: string) {
    const pubkey = bytesToHex(this.topicToKeyPair[requestId].publicKey)
    const base64Config = Buffer.from(JSON.stringify(this.topicToConfig[requestId])).toString(
      "base64",
    )
    const base64Service = Buffer.from(JSON.stringify(this.topicToService[requestId])).toString(
      "base64",
    )
    return `https://zkpassport.id/r?d=${this.domain}&t=${requestId}&c=${base64Config}&s=${base64Service}&p=${pubkey}`
  }

  /**
   * @notice Cancels a request by closing the WebSocket connection and deleting the associated data.
   * @param requestId The request ID.
   */
  public cancelRequest(requestId: string) {
    if (this.topicToWebSocketClient[requestId]) {
      this.topicToWebSocketClient[requestId].close()
      delete this.topicToWebSocketClient[requestId]
    }
    delete this.topicToKeyPair[requestId]
    delete this.topicToConfig[requestId]
    delete this.topicToLocalConfig[requestId]
    delete this.topicToSharedSecret[requestId]
    delete this.topicToProofs[requestId]
    delete this.topicToExpectedProofCount[requestId]
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
    for (const requestId in this.topicToWebSocketClient) {
      this.cancelRequest(requestId)
    }
  }
}
