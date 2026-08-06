import {
  type DisclosableIDCredential,
  type IDCredential,
  type IDCredentialValue,
  type NumericalIDCredential,
  type ProofResult,
  type QueryResult,
  type CountryName,
  type JsonRpcRequest,
  type Query,
  type FacematchMode,
  type SanctionsCountries,
  type SanctionsLists,
  type SupportedChain,
  type ProofMode,
  type BoundData,
  type Service,
  NullifierType,
  getProofData,
  getNumberOfPublicInputs,
  formatQueryResultDates,
} from "@zkpassport/utils"
import { noLogger as logger } from "./logger"
import { Buffer } from "buffer/"
import { Bridge, BridgeInterface } from "@obsidion/bridge"
import {
  QueryBuilder,
  QueryBuilderResult,
  OfflineQueryBuilderResult,
  DashboardConfig,
  Policy,
  QueryResultErrors,
} from "./types"
import { generalCompare, normalizeCountry, numericalCompare, rangeCompare } from "./query-helpers"
import { createOfflineQuery } from "./offline-query"
import { PublicInputChecker } from "./public-input-checker"
import { SolidityVerifier } from "./solidity-verifier"
import { submitProof } from "./dashboard-api"
import {
  createUltraHonkVerifier,
  getBBVersionForCircuitVersion,
  UnsupportedBBVersionError,
} from "./bb-verifier"
import { DASHBOARD_API_BASE_URL, DEFAULT_VALIDITY, VERSION } from "./constants"
import { getManifestCached, getPackagedCircuitCached } from "./circuit-cache"

// If Buffer is not defined, then we use the Buffer from the buffer package
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer as any // eslint-disable-line
  if (typeof window !== "undefined") {
    window.Buffer = Buffer as any // eslint-disable-line
  }
}

function policyScope(policy: { id: string; version: number }): string {
  return `${policy.id}:${policy.version}`
}

const DEFAULT_PURPOSE = "Verify identity privately"

export {
  SANCTIONED_COUNTRIES,
  EU_COUNTRIES,
  EEA_COUNTRIES,
  SCHENGEN_COUNTRIES,
  ASEAN_COUNTRIES,
  MERCOSUR_COUNTRIES,
  ProofType,
  ProofTypeLength,
  NullifierType,
  type ProofResult,
  type DisclosableIDCredential,
  type IDCredential,
  type IDCredentialValue,
  type NumericalIDCredential,
  type QueryResult,
  type CountryName,
  type JsonRpcRequest,
  type Query,
  type FacematchMode,
  type SanctionsCountries,
  type SanctionsLists,
  type SupportedChain,
  type ProofMode,
  type BoundData,
  type Service,
} from "@zkpassport/utils"

export * from "./types"
// Also exported from "@zkpassport/sdk/query" (avoids pulling in the ZKPassport class)
export { createOfflineQuery } from "./offline-query"

export class ZKPassport {
  private domain: string
  private domainProvided: boolean
  private disableProofStorage: boolean
  private topicToConfig: Record<string, Query> = {}
  private topicToLocalConfig: Record<
    string,
    {
      validity: number
      mode: ProofMode
      devMode: boolean
      uniqueIdentifierType: NullifierType | undefined
      oprfKeyId: string | null
      returnDeepLink: string | undefined
      skipProofVerification: boolean
    }
  > = {}
  private topicToPublicKey: Record<string, string> = {}
  private topicToBridge: Record<string, BridgeInterface> = {}
  private topicToRequestReceived: Record<string, boolean> = {}
  private topicToService: Record<string, Service> = {}
  private topicToCallerPurpose: Record<string, string | undefined> = {}
  private topicToProofs: Record<string, Array<ProofResult>> = {}
  private topicToFailedProofCount: Record<string, number> = {}
  private topicToResults: Record<string, QueryResult> = {}
  private topicToPolicy: Record<string, { id: string; version: number }> = {}
  private topicToVisibilityCleanup: Record<string, () => void> = {}
  private dashboardConfig: DashboardConfig | null = null
  private dashboardConfigPromise: Promise<DashboardConfig> | null = null
  private dashboardConfigError: Error | null = null

  private onRequestReceivedCallbacks: Record<string, Array<() => void>> = {}
  private onGeneratingProofCallbacks: Record<string, Array<(topic: string) => void>> = {}
  private onBridgeConnectCallbacks: Record<string, Array<() => void>> = {}
  private onProofGeneratedCallbacks: Record<string, Array<(proof: ProofResult) => void>> = {}
  private onResultCallbacks: Record<
    string,
    Array<
      (response: {
        uniqueIdentifier: string | undefined
        uniqueIdentifierType: NullifierType | undefined
        verified: boolean | undefined
        result: QueryResult
        queryResultErrors?: Partial<QueryResultErrors>
        proofs: ProofResult[]
        sdkInstance: ZKPassport
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

  constructor(_domain?: string, options?: { disableProofStorage?: boolean }) {
    if (!_domain && typeof window === "undefined") {
      throw new Error("Domain argument is required in Node.js environment")
    }
    this.domainProvided = !!_domain
    this.domain = this.normalizeDomain(_domain || window.location.hostname)
    this.disableProofStorage = options?.disableProofStorage ?? false
  }

  private async handleResult(topic: string) {
    logger.debug("Starting verification for topic:", topic)
    const result = this.topicToResults[topic]
    // Clear the results straight away to avoid concurrency issues
    delete this.topicToResults[topic]
    const proofs = this.topicToProofs[topic]
    // Verify the proofs and extract the unique identifier (aka nullifier) and the verification result
    const { uniqueIdentifier, uniqueIdentifierType, verified, queryResultErrors } =
      await this.verify({
        proofs,
        originalQuery: this.topicToConfig[topic],
        queryResult: result,
        validity: this.topicToLocalConfig[topic]?.validity,
        scope: this.topicToService[topic]?.scope,
        devMode: this.topicToLocalConfig[topic]?.devMode,
        oprfKeyId: this.topicToLocalConfig[topic]?.oprfKeyId ?? undefined,
        skipProofVerification: this.topicToLocalConfig[topic]?.skipProofVerification,
      })
    logger.debug("Verification complete, verified:", verified)
    const hasFailedProofs = this.topicToFailedProofCount[topic] > 0
    const finalVerified = hasFailedProofs ? false : verified
    // Browser-only callers (no explicit domain) can't be authenticated
    const devMode = this.topicToLocalConfig[topic]?.devMode === true
    // undefined (verification skipped) still submits: the dashboard API re-checks
    if (finalVerified !== false && this.domainProvided && !this.disableProofStorage && !devMode) {
      void submitProof({
        domain: this.domain,
        proofs: this.topicToProofs[topic],
        query: this.topicToConfig[topic],
        queryResult: result,
        scope: this.topicToService[topic]?.scope,
        requestId: this.topicToPublicKey[topic],
      })
    }
    delete this.topicToProofs[topic]
    await Promise.all(
      this.onResultCallbacks[topic].map((callback) =>
        callback({
          // If there are failed proofs, we don't return the unique identifier and we set the verified result to false
          uniqueIdentifier: hasFailedProofs ? undefined : uniqueIdentifier,
          uniqueIdentifierType: hasFailedProofs ? undefined : uniqueIdentifierType,
          verified: hasFailedProofs ? false : verified,
          result,
          queryResultErrors,
          proofs,
          sdkInstance: this,
        }),
      ),
    )
    // Clear the expected proof count and failed proof count
    delete this.topicToFailedProofCount[topic]
  }

  /** Handle an encrypted message. */
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
      // If the results were received before all the proofs were generated, we can handle the result now
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
      // Handle the result only once all proofs have been received
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
        // Unsupported ID: no proofs will come, handle the result now
        if (this.topicToResults[topic]) {
          await this.handleResult(topic)
        }
      } else if (error && error.startsWith("Cannot generate proof")) {
        // A disclosure proof failed to generate: track the failed count
        this.topicToFailedProofCount[topic] += 1
        // All expected proofs accounted for: handle the result now
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

  private assertNotPolicyLocked(topic: string, method: string) {
    if (this.topicToPolicy[topic]) {
      throw new Error(
        `Cannot call .${method}() on a policy-driven request. The query for policy '${this.topicToPolicy[topic].id}' is immutable.`,
      )
    }
  }

  private getZkPassportRequest<T extends "online" | "offline" = "online">(
    topic: string,
  ): QueryBuilder<T> {
    return {
      eq: <T extends IDCredential>(key: T, value: IDCredentialValue<T>) => {
        this.assertNotPolicyLocked(topic, "eq")
        if (key === "issuing_country" || key === "nationality") {
          value = normalizeCountry(value as CountryName) as IDCredentialValue<T>
        }
        generalCompare("eq", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      gte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        this.assertNotPolicyLocked(topic, "gte")
        numericalCompare("gte", key, value, topic, this.topicToConfig)
        if (key === "age" && ((value as number) < 1 || (value as number) >= 100)) {
          throw new Error("Age must be between 1 and 99 (inclusive)")
        }
        return this.getZkPassportRequest(topic)
      },
      gt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        this.assertNotPolicyLocked(topic, "gt")
        numericalCompare("gt", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      lte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        this.assertNotPolicyLocked(topic, "lte")
        numericalCompare("lte", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      lt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
        this.assertNotPolicyLocked(topic, "lt")
        numericalCompare("lt", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      range: <T extends NumericalIDCredential>(
        key: T,
        start: IDCredentialValue<T>,
        end: IDCredentialValue<T>,
      ) => {
        this.assertNotPolicyLocked(topic, "range")
        rangeCompare(key, [start, end], topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      in: <T extends "nationality" | "issuing_country">(key: T, value: IDCredentialValue<T>[]) => {
        this.assertNotPolicyLocked(topic, "in")
        value = value.map((v) => normalizeCountry(v as CountryName)) as IDCredentialValue<T>[]
        generalCompare("in", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      out: <T extends "nationality" | "issuing_country">(key: T, value: IDCredentialValue<T>[]) => {
        this.assertNotPolicyLocked(topic, "out")
        value = value.map((v) => normalizeCountry(v as CountryName)) as IDCredentialValue<T>[]
        generalCompare("out", key, value, topic, this.topicToConfig)
        return this.getZkPassportRequest(topic)
      },
      disclose: (key: DisclosableIDCredential) => {
        this.assertNotPolicyLocked(topic, "disclose")
        this.topicToConfig[topic][key] = {
          ...this.topicToConfig[topic][key],
          disclose: true,
        }
        return this.getZkPassportRequest(topic)
      },
      bind: <T extends keyof BoundData>(
        key: T,
        value: T extends "chain"
          ? SupportedChain
          : T extends "user_address"
            ? `0x${string}`
            : string | undefined,
      ) => {
        // Runtime payload: composes with policies (it only adds committed data)
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
        this.assertNotPolicyLocked(topic, "sanctions")
        this.topicToConfig[topic].sanctions = {
          ...this.topicToConfig[topic].sanctions,
          // TODO: merge custom lists once the circuits support them
          countries,
          lists,
          strict: options.strict ?? false,
        }
        return this.getZkPassportRequest(topic)
      },
      facematch: (mode: FacematchMode = "regular") => {
        this.assertNotPolicyLocked(topic, "facematch")
        this.topicToConfig[topic].facematch = {
          mode,
        }
        return this.getZkPassportRequest(topic)
      },
      raw: (query: Query) => {
        this.assertNotPolicyLocked(topic, "raw")
        const { policy, bind, ...conditions } = query
        if (policy) {
          if (Object.keys(conditions).length > 0) {
            throw new Error("A query with `policy` cannot also carry conditions (bind is allowed).")
          }
          this.getZkPassportRequest(topic).policy(policy)
          if (bind) this.topicToConfig[topic].bind = bind
        } else {
          this.topicToConfig[topic] = query
        }
        return this.getZkPassportRequest(topic)
      },
      policy: (id: string) => {
        this.assertCanApplyPolicy(topic, id)
        if (!this.dashboardConfig) {
          if (this.dashboardConfigError) throw this.dashboardConfigError
          throw new Error(
            `Cannot apply policy '${id}': dashboard config is unavailable for domain '${this.domain}'.`,
          )
        }
        const policy = this.findPolicy(this.dashboardConfig, id)
        this.topicToConfig[topic] = policy.query
        // Policy locks scope; caller's purpose still wins when provided.
        const svc = this.topicToService[topic]
        if (svc) {
          if (!this.topicToCallerPurpose[topic]) {
            svc.purpose = policy.purpose || DEFAULT_PURPOSE
          }
          svc.scope = policyScope(policy)
        }
        this.topicToPolicy[topic] = { id: policy.id, version: policy.version }
        return this.getZkPassportRequest(topic)
      },
      done: (() => {
        this.topicToFailedProofCount[topic] = 0
        const localConfig = this.topicToLocalConfig[topic]
        const query = this.topicToConfig[topic]
        const hasFaceMatch = !!query.facematch
        const hasStrictFacematch = !!query.facematch && query.facematch?.mode === "strict"

        // Validate: SALTED nullifier requires strict facematch
        if (localConfig.uniqueIdentifierType === NullifierType.SALTED) {
          if ((localConfig.devMode === false && !hasStrictFacematch) || !hasFaceMatch) {
            throw new Error(
              "Salted nullifier requires strict facematch. Add .facematch('strict') to your query or remove the salted nullifier option.",
            )
          }
        }

        return {
          url: this._getUrl(topic),
          query: this.topicToConfig[topic],
          requestId: topic,
          policy: this.topicToPolicy[topic]?.id,
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
              uniqueIdentifierType: NullifierType | undefined
              verified: boolean | undefined
              result: QueryResult
              queryResultErrors?: Partial<QueryResultErrors>
              proofs: ProofResult[]
              sdkInstance: ZKPassport
            }) => void,
          ) => this.onResultCallbacks[topic].push(callback),
          onReject: (callback: () => void) => this.onRejectCallbacks[topic].push(callback),
          onError: (callback: (error: string) => void) =>
            this.onErrorCallbacks[topic].push(callback),
          isBridgeConnected: () => this.topicToBridge[topic].isBridgeConnected(),
          requestReceived: () => this.topicToRequestReceived[topic] === true,
        }
      }) as unknown as () => T extends "online" ? QueryBuilderResult : OfflineQueryBuilderResult,
    }
  }

  private async getDashboardConfig(): Promise<DashboardConfig> {
    if (this.dashboardConfig) return this.dashboardConfig
    if (!this.dashboardConfigPromise) {
      this.dashboardConfigPromise = this.fetchDashboardConfig()
        .then((c) => {
          this.dashboardConfig = c
          return c
        })
        .catch((e) => {
          this.dashboardConfigPromise = null
          throw e
        })
    }
    return this.dashboardConfigPromise
  }

  private async fetchDashboardConfig(): Promise<DashboardConfig> {
    const url = `${DASHBOARD_API_BASE_URL}/public/project?domain=${encodeURIComponent(this.domain)}`
    let response: Response
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    } catch (e) {
      throw new Error(
        `Failed to fetch dashboard config for domain '${this.domain}': ${(e as Error).message}`,
      )
    }
    if (response.status === 404) {
      throw new Error(
        `Domain '${this.domain}' is not registered with the ZKPassport dashboard. To use policies, register your domain at https://dashboard.zkpassport.id, or use self-serve mode (pass name/logo/purpose to request()).`,
      )
    }
    if (!response.ok) {
      throw new Error(
        `Failed to fetch dashboard config for domain '${this.domain}': ${response.status} ${response.statusText}`,
      )
    }
    const config = (await response.json()) as DashboardConfig
    if (!config || !config.project || !Array.isArray(config.policies)) {
      throw new Error(`Invalid dashboard config response for domain '${this.domain}'`)
    }
    return config
  }

  private findPolicy(config: DashboardConfig, policyId: string): Policy {
    const policy = config.policies.find((p) => p.id === policyId)
    if (!policy) {
      throw new Error(
        `Policy '${policyId}' not found for domain '${this.domain}'. The dashboard returned ${config.policies.length} policies for this domain.`,
      )
    }
    if (!Number.isInteger(policy.version) || policy.version < 1) {
      throw new Error(
        `Invalid policy '${policyId}' for domain '${this.domain}': version must be a positive integer (got ${JSON.stringify(policy.version)}).`,
      )
    }
    if (!policy.query || typeof policy.query !== "object") {
      throw new Error(
        `Invalid policy '${policyId}' for domain '${this.domain}': missing query object.`,
      )
    }
    return policy
  }

  private assertCanApplyPolicy(topic: string, id: string): void {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(".policy() requires a non-empty string id.")
    }
    if (this.topicToPolicy[topic]) {
      throw new Error(
        `Cannot call .policy() more than once on a request (already set to '${this.topicToPolicy[topic].id}').`,
      )
    }
    if (Object.keys(this.topicToConfig[topic]).length > 0) {
      throw new Error("Cannot combine .policy() with builder methods like .gte()/.disclose()/etc.")
    }
  }

  /** Create a new request. */
  public async request({
    name,
    logo,
    purpose,
    scope,
    projectID,
    mode,
    validity,
    devMode,
    uniqueIdentifierType,
    oprfKeyId,
    topicOverride,
    keyPairOverride,
    cloudProverUrl,
    bridgeUrl,
    returnDeepLink,
    skipProofVerification,
  }: {
    name?: string
    logo?: string
    purpose?: string
    scope?: string
    mode?: ProofMode
    projectID?: string
    validity?: number
    devMode?: boolean
    uniqueIdentifierType?: NullifierType.NON_SALTED | NullifierType.SALTED
    oprfKeyId?: string
    topicOverride?: string
    keyPairOverride?: { privateKey: Uint8Array; publicKey: Uint8Array }
    cloudProverUrl?: string
    bridgeUrl?: string
    returnDeepLink?: string
    // Skip in-browser proof verification: verified becomes undefined (not checked); verify server-side.
    skipProofVerification?: boolean
  }): Promise<QueryBuilder> {
    if (topicOverride === "offline-query") {
      throw new Error("You cannot override the topic with 'offline-query'")
    }

    let config: DashboardConfig | undefined
    try {
      config = await this.getDashboardConfig()
      this.dashboardConfigError = null
    } catch (e) {
      this.dashboardConfigError = e as Error
    }

    const bridge = await Bridge.create({
      keyPair: keyPairOverride,
      bridgeId: topicOverride,
      bridgeUrl,
    })

    const topic = bridge.connection.getBridgeId()

    this.topicToConfig[topic] = {}
    this.topicToCallerPurpose[topic] = purpose
    this.topicToService[topic] = {
      name: name || config?.project?.name || this.domain,
      logo: logo || config?.project?.logoUrl || "",
      purpose: purpose || DEFAULT_PURPOSE,
      scope,
      projectID,
      cloudProverUrl,
      bridgeUrl,
    }
    this.topicToProofs[topic] = []
    this.topicToLocalConfig[topic] = {
      validity: validity || DEFAULT_VALIDITY,
      mode: mode || "fast",
      devMode: devMode ?? false,
      uniqueIdentifierType: oprfKeyId ? NullifierType.SALTED : uniqueIdentifierType,
      oprfKeyId: oprfKeyId ?? null,
      returnDeepLink,
      skipProofVerification: skipProofVerification ?? false,
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

    // Mobile browsers freeze backgrounded websockets; reconnect on foreground
    if (typeof document !== "undefined") {
      const onVisibilityChange = () => {
        if (document.visibilityState !== "visible") return
        const activeBridge = this.topicToBridge[topic]
        if (!activeBridge || activeBridge.isBridgeConnected())
          return // Available from @obsidion/bridge versions with reconnectNow; older
          // versions rely on their internal auto-reconnect backoff alone
        ;(activeBridge as { reconnectNow?: () => void }).reconnectNow?.()
      }
      document.addEventListener("visibilitychange", onVisibilityChange)
      this.topicToVisibilityCleanup[topic] = () =>
        document.removeEventListener("visibilitychange", onVisibilityChange)
    }

    bridge.onConnect(async (reconnection: boolean) => {
      logger.debug("Bridge connected")
      logger.debug("Is reconnection:", reconnection)
      await Promise.all(this.onBridgeConnectCallbacks[topic].map((callback) => callback()))
    })
    bridge.onSecureChannelEstablished(async () => {
      logger.debug("Secure channel established")
      await Promise.all(this.onRequestReceivedCallbacks[topic].map((callback) => callback()))
    })
    // eslint-disable-next-line
    bridge.onSecureMessage(async (message: any) => {
      logger.debug("Received message:", message)
      this.handleEncryptedMessage(topic, message)
    })
    return this.getZkPassportRequest(topic)
  }

  /** Create a new offline query Unlike request(), this function does not connect to the bridge. */
  public createQuery(): QueryBuilder<"offline"> {
    return createOfflineQuery()
  }

  /** Verify the proofs received from the mobile app. */
  public async verify({
    proofs,
    originalQuery,
    queryResult,
    validity,
    scope,
    devMode = false,
    writingDirectory,
    oprfKeyId,
    skipProofVerification = false,
  }: {
    proofs: Array<ProofResult>
    originalQuery: Query
    queryResult: QueryResult
    validity?: number
    scope?: string
    devMode?: boolean
    writingDirectory?: string
    oprfKeyId?: string
    // Skip cryptographic verification (consistency checks still run): verified is undefined when they pass.
    skipProofVerification?: boolean
  }): Promise<{
    uniqueIdentifier: string | undefined
    uniqueIdentifierType: NullifierType | undefined
    verified: boolean | undefined
    queryResultErrors?: Partial<QueryResultErrors>
  }> {
    // If no proofs were generated, the results can't be trusted.
    if (!proofs || proofs.length === 0) {
      return {
        uniqueIdentifier: undefined,
        uniqueIdentifierType: undefined,
        verified: false,
      }
    }
    const formattedResult: QueryResult = formatQueryResultDates(queryResult)

    // Default the writing directory to /tmp outside the browser
    if (typeof window === "undefined" && !writingDirectory) {
      writingDirectory = "/tmp"
    }
    let verified: boolean | undefined = true
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
      originalQuery,
      formattedResult,
      validity,
      scope,
      oprfKeyId,
      devMode,
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
      // Mock nullifiers are only valid in dev mode
      verified = false
      console.warn(
        "You are trying to verify a mock proof. This is only allowed in dev mode. To enable dev mode, set the `devMode` parameter to `true` in the request function parameters.",
      )
    }
    // Only proceed with the proof verification if the public inputs are correct
    if (verified && skipProofVerification) {
      // Checks passed but proofs unchecked: undefined, distinct from true/false
      verified = undefined
    } else if (verified) {
      // bb.js only loads here, so skipping verification never triggers the import
      let verifierHandle: Awaited<ReturnType<typeof createUltraHonkVerifier>> | undefined
      try {
        const bbVersion = getBBVersionForCircuitVersion(proofs[0]?.version)
        verifierHandle = await createUltraHonkVerifier(bbVersion, { writingDirectory })
      } catch (e) {
        // Unsupported-forever proofs are a hard error, not a soft backend failure
        if (e instanceof UnsupportedBBVersionError) throw e
        console.warn(
          "The proof verification backend (bb.js) could not be loaded, so the proofs were not verified. Verify them server-side instead.",
          e,
        )
        verified = undefined
      }
      if (verifierHandle) {
        verified = await this.verifyProofsWithBackend({
          proofs,
          verifier: verifierHandle.verifier,
          scope,
          devMode,
        })
        // Release the bb.js wasm instance loaded for this verify() call
        await verifierHandle.destroy()
      }
    }

    // If the proofs failed verification, we don't return the unique identifier.
    uniqueIdentifier = verified === false ? undefined : uniqueIdentifier
    uniqueIdentifierType = verified === false ? undefined : uniqueIdentifierType
    return { uniqueIdentifier, uniqueIdentifierType, verified, queryResultErrors }
  }

  private async verifyProofsWithBackend({
    proofs,
    verifier,
    scope,
    devMode,
  }: {
    proofs: Array<ProofResult>
    verifier: Awaited<ReturnType<typeof createUltraHonkVerifier>>["verifier"]
    scope?: string
    devMode: boolean
  }): Promise<boolean> {
    let verified = true
    {
      // Cached fetches: after browser-side proving these are already in memory
      const circuitManifest = await getManifestCached(
        // We assume all proofs have the same version
        proofs[0].version!,
        devMode,
      )
      for (const proof of proofs) {
        const isOuterEVM = proof.name?.startsWith("outer_evm_")
        const proofName = proof.name!
        const proofData = getProofData(proof.proof as string, getNumberOfPublicInputs(proofName))
        const hostedPackagedCircuit = await getPackagedCircuitCached(
          proofName,
          circuitManifest,
          devMode,
          // TODO: set to always validate when the issue is vkey hash calculation is fixed
          { validate: !isOuterEVM },
        )
        if (isOuterEVM) {
          try {
            const { createPublicClient, http } = await import("viem")
            const { sepolia } = await import("viem/chains")
            const { mainnet } = await import("viem/chains")
            const { address, abi, functionName } = this.getSolidityVerifierDetails()
            const rpcUrl = devMode
              ? "https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G"
              : "https://eth-mainnet.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G"
            const client = createPublicClient({
              chain: devMode ? sepolia : mainnet,
              transport: http(rpcUrl),
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
            console.warn(`Error verifying proof ${proofName}`, e)
            verified = false
          }
        }
        if (!verified) {
          // Break the loop if the proof is not valid and don't bother checking the other proofs
          break
        }
      }
    }
    return verified
  }

  public getSolidityVerifierDetails(): {
    address: `0x${string}`
    functionName: string
    abi: {
      type: "function" | "event" | "constructor"
      name: string
      inputs: { name: string; type: string; internalType: string }[]
      outputs: { name: string; type: string; internalType: string }[]
    }[]
  } {
    return SolidityVerifier.getDetails()
  }

  public getSolidityVerifierParameters({
    proof,
    validityPeriodInSeconds = DEFAULT_VALIDITY,
    domain,
    scope,
    devMode = false,
    // oprfPubKeyHash,
  }: {
    proof: ProofResult
    validityPeriodInSeconds?: number
    domain?: string
    scope?: string
    devMode?: boolean
    // oprfPubKeyHash?: string
  }) {
    return SolidityVerifier.getParameters({
      proof,
      validityPeriodInSeconds,
      domain: domain ?? this.domain,
      scope,
      devMode,
      // oprfPubKeyHash,
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
    // The integrity-check proof must be newer than now minus the validity period
    const timestamp = Math.floor(Date.now() / 1000) - this.topicToLocalConfig[requestId].validity
    const nullifierType = this.topicToLocalConfig[requestId].uniqueIdentifierType
    const oprfKeyId = this.topicToLocalConfig[requestId].oprfKeyId
    const returnDeepLink = this.topicToLocalConfig[requestId].returnDeepLink
    let url = `https://zkpassport.id/r?d=${this.domain}&t=${requestId}&c=${base64Config}&s=${base64Service}&p=${pubkey}&m=${this.topicToLocalConfig[requestId].mode}&v=${VERSION}&dt=${timestamp}&dev=${this.topicToLocalConfig[requestId].devMode ? "1" : "0"}`
    if (nullifierType) {
      url += `&nt=${nullifierType}`
    }
    if (oprfKeyId) {
      url += `&oprf_k=${oprfKeyId}`
    }
    if (returnDeepLink) {
      url += `&r=${encodeURIComponent(returnDeepLink)}`
    }
    return url
  }

  /** Returns the URL of the request. */
  public getUrl(requestId: string) {
    return this._getUrl(requestId)
  }

  /** Resolved service details (name, logo, purpose) for a pending request. */
  public getServiceDetails(requestId: string): Service | undefined {
    return this.topicToService[requestId]
  }

  /** Cancels a request by closing the WebSocket connection and deleting the associated data. */
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
    delete this.topicToPolicy[requestId]
    this.topicToVisibilityCleanup[requestId]?.()
    delete this.topicToVisibilityCleanup[requestId]
    this.onRequestReceivedCallbacks[requestId] = []
    this.onGeneratingProofCallbacks[requestId] = []
    this.onBridgeConnectCallbacks[requestId] = []
    this.onProofGeneratedCallbacks[requestId] = []
    this.onRejectCallbacks[requestId] = []
    this.onErrorCallbacks[requestId] = []
  }

  /** Clears all requests. */
  public clearAllRequests() {
    for (const requestId in this.topicToBridge) {
      this.cancelRequest(requestId)
    }
  }
}
