import {
  BoundData,
  IDCredential,
  IDCredentialValue,
  NumericalIDCredential,
  NullifierType,
  QueryResult,
  SanctionsCountries,
  SanctionsLists,
  DisclosableIDCredential,
  FacematchMode,
  ProofResult,
  ProofMode,
  SupportedChain,
  Query,
} from "@zkpassport/utils"

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
    | "outer"
    | "disclose"
    | "bind"
    | "facematch"
    | "sanctions"]: {
    disclose?: QueryResultError<string | number | Date>
    gte?: QueryResultError<number | Date>
    gt?: QueryResultError<number | Date>
    lte?: QueryResultError<number | Date>
    lt?: QueryResultError<number | Date>
    range?: QueryResultError<[number | Date, number | Date]>
    in?: QueryResultError<string[]>
    out?: QueryResultError<string[]>
    eq?: QueryResultError<string | number | Date>
    commitment?: QueryResultError<string>
    date?: QueryResultError<string>
    certificate?: QueryResultError<string>
    scope?: QueryResultError<string>
  }
}

export type SolidityProofVerificationData = {
  vkeyHash: string
  proof: string
  publicInputs: string[]
}

export type SolidityServiceConfig = {
  validityPeriodInSeconds: number
  domain: string
  scope: string
  devMode: boolean
  // oprfPubKeyHash: string
}

export type SolidityVerifierParameters = {
  version: string
  proofVerificationData: SolidityProofVerificationData
  committedInputs: string
  serviceConfig: SolidityServiceConfig
}

/**
 * An immutable, versioned policy belonging to an organization (optionally
 * locked to one application). The SDK looks one up by `id` from the per-domain
 * `DashboardConfig` and uses its `query` to populate the request. The scope of
 * a policy-driven request defaults to `<id>@v<version>` so proofs from
 * different versions stay filterable apart (overridable only by an explicit
 * `scope` passed to `request()`).
 *
 * Mirrors the row returned by the dashboard's `/public/app` endpoint.
 */
export type Policy = {
  id: string
  version: number
  name: string
  /** Per-policy default purpose, overridable per-request. Empty string when unset. */
  purpose: string
  /** Default validity window for proofs in seconds. */
  validity: number | null
  mode: ProofMode
  devMode: boolean
  /** NULL = reusable across the org, set = locked to that app. */
  applicationId: string | null
  query: Query
}

/**
 * The per-domain configuration returned by the dashboard's `/public/app`
 * endpoint. Includes the verified app and the policies that may run against
 * this domain (org-wide policies plus any locked to this app). `policies` may
 * be empty — that's a valid response for a registered domain with no policies
 * yet.
 */
export type DashboardConfig = {
  app: {
    name: string
    domain: string
    logoUrl: string | null
    allowedOrigins: string[]
  }
  policies: Policy[]
}

export type QueryBuilderResult = {
  /**
   * The URL of the request.
   *
   * You can either encode the URL in a QR code or let the user click the link
   * to this URL on your website if they're visiting your website on their phone.
   */
  url: string
  /**
   * The query object.
   */
  query: Query
  /**
   * The id of the request.
   */
  requestId: string
  /**
   * The policy used to build the request, if one was provided.
   */
  policy?: { id: string; version: number }
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
      uniqueIdentifierType: NullifierType | undefined
      verified: boolean
      result: QueryResult
      queryResultErrors?: Partial<QueryResultErrors>
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

export type OfflineQueryBuilderResult = {
  query: Query
}

export type QueryBuilder<T extends "online" | "offline" = "online"> = {
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
   * Requires this attribute to be greater than the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  gt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /**
   * Requires this attribute to be less than or equal to the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  lte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /**
   * Requires this attribute to be less than the provided value.
   * @param key The attribute to compare.
   * @param value The value of the attribute you require.
   */
  lt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
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
   * Binds a value to the request.
   * @param key The key of the value to bind.
   * @param value The value to bind the request to.
   */
  bind: <T extends keyof BoundData>(
    key: T,
    value: T extends "chain"
      ? SupportedChain
      : T extends "user_address"
        ? `0x${string}`
        : string | undefined,
  ) => QueryBuilder
  /**
   * Requires that the ID holder is not part of any of the specified sanction lists.
   * @param countries The country or list of countries whose sanction lists to check against. Defaults to "all".
   * e.g. "US", ["US", "GB", "CH", "EU"], "all"
   * @param lists The specific lists from a given country to check against. Defaults to "all".
   * e.g. ["OFAC_SDN"], "all"
   * @param options The options to use for the sanction check.
   * @param options.strict Whether to use a strict sanction check. Defaults to false.
   *
   * If set to true, this means the checks will be done against just the lastname and firstname,
   * while when set to false, matches will need to include either the date of birth and name or
   * the passport number and nationality.
   * Strict mode has therefore a higher false positive rate but is harder to evade.
   */
  sanctions: (
    countries?: SanctionsCountries,
    lists?: SanctionsLists,
    options?: { strict?: boolean },
  ) => QueryBuilder
  /**
   * This feature is not available yet in the public release of the app.
   * Requires that the ID holder's face matches the photo on the ID.
   * @param mode The mode to use for the face match. Defaults to "regular".
   * @param mode "strict" - The user will have to go through an extensive liveness check to prevent spoofing making it more secure.
   * Best for high security requirements such as KYC.
   * @param mode "regular" - The user will only have to go through a basic liveness check to prevent spoofing, making it faster for the user.
   * Best for lower security requirements that requires fast verification such as age verification.
   */
  facematch: (mode?: FacematchMode) => QueryBuilder
  /**
   * Applies an immutable policy that was pre-fetched as part of the per-domain
   * dashboard config during `request()`. The returned builder has its query locked:
   * any subsequent `.gte()`, `.disclose()`, etc. will throw.
   *
   * Intended usage is `(await zk.request({...})).policy('<id>').done()`. Any
   * branding (`name`/`logo`/`purpose`/`scope`) or per-request fields
   * (`validity`/`mode`/`devMode`) passed to `request()` override the policy's
   * stored values; fields the caller omits fall back to the policy.
   *
   * Combining `.policy()` with builder methods like `.gte()`/`.disclose()` in
   * either order throws.
   *
   * Throws synchronously if the dashboard config was not available (the fetch
   * during `request()` failed).
   *
   * @param id The policy id (e.g. `'pol_xyz'`).
   */
  policy: (id: string) => QueryBuilder<T>
  /**
   * Builds the request.
   *
   * This will return the URL of the request, which you can either encode in a QR code
   * or provide as a link to the user if they're visiting your website on their phone.
   * It also returns all the callbacks you can use to handle the user's response.
   */
  done: () => T extends "online" ? QueryBuilderResult : OfflineQueryBuilderResult
}
