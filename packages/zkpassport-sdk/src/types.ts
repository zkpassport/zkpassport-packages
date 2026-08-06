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
  SupportedChain,
  Query,
} from "@zkpassport/utils"
import type { ZKPassport } from "./index"

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

export type Policy = {
  id: string
  version: number
  name: string
  purpose: string
  projectId: string | null
  query: Query
}

export type DashboardConfig = {
  project: {
    name: string
    domain: string
    logoUrl: string | null
    allowedOrigins: string[]
  }
  policies: Policy[]
}

export type QueryBuilderResult = {
  /** The URL of the request. */
  url: string
  /** The query object. */
  query: Query
  /** The id of the request. */
  requestId: string
  /** The id of the policy used to build the request, if one was provided. */
  policy?: string
  /** Called when the user has scanned the QR code or clicked the link to the request. */
  onRequestReceived: (callback: () => void) => void
  /** Called when the user has accepted the request and started to generate the proof on their phone. */
  onGeneratingProof: (callback: () => void) => void
  /** Called when the SDK successfully connects to the bridge with the mobile app. */
  onBridgeConnect: (callback: () => void) => void
  /** Called when the user has generated a proof. */
  onProofGenerated: (callback: (proof: ProofResult) => void) => void
  /** Called when the user has sent the query result. */
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
  ) => void
  /** Called when the user has rejected the request. */
  onReject: (callback: () => void) => void
  /** Called when an error occurs, such as one of the requirements not being met or a proof failing to be generated. */
  onError: (callback: (error: string) => void) => void
  /** true if the bridge with the mobile app is connected */
  isBridgeConnected: () => boolean
  /** Whether the request has been received on the user's phone. */
  requestReceived: () => boolean
}

export type OfflineQueryBuilderResult = {
  query: Query
}

export type QueryBuilder<T extends "online" | "offline" = "online"> = {
  /** Requires this attribute to be equal to the provided value. */
  eq: <T extends IDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /** Requires this attribute to be greater than or equal to the provided value. */
  gte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /** Requires this attribute to be greater than the provided value. */
  gt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /** Requires this attribute to be less than or equal to the provided value. */
  lte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /** Requires this attribute to be less than the provided value. */
  lt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => QueryBuilder
  /** Requires this attribute to be included in the provided range. */
  range: <T extends NumericalIDCredential>(
    key: T,
    start: IDCredentialValue<T>,
    end: IDCredentialValue<T>,
  ) => QueryBuilder
  /** Requires this attribute to be included in the provided list. */
  in: <T extends "nationality" | "issuing_country">(
    key: T,
    value: IDCredentialValue<T>[],
  ) => QueryBuilder
  /** Requires this attribute to be excluded from the provided list. */
  out: <T extends "nationality" | "issuing_country">(
    key: T,
    value: IDCredentialValue<T>[],
  ) => QueryBuilder
  /** Requires this attribute to be disclosed. */
  disclose: (key: DisclosableIDCredential) => QueryBuilder
  /** Binds a value to the request. */
  bind: <T extends keyof BoundData>(
    key: T,
    value: T extends "chain"
      ? SupportedChain
      : T extends "user_address"
        ? `0x${string}`
        : string | undefined,
  ) => QueryBuilder
  /** Requires that the ID holder is not part of any of the specified sanction lists. */
  sanctions: (
    countries?: SanctionsCountries,
    lists?: SanctionsLists,
    options?: { strict?: boolean },
  ) => QueryBuilder
  /** Requires that the ID holder's face matches the photo on the ID. */
  facematch: (mode?: FacematchMode) => QueryBuilder
  // @internal Seed from an already-built (serialized) Query, replacing anything set so far.
  raw: (query: Query) => QueryBuilder<T>
  /** Applies an immutable policy fetched from the dashboard. */
  policy: (id: string) => QueryBuilder<T>
  /** Builds the request: returns the request URL and the result callbacks. */
  done: () => T extends "online" ? QueryBuilderResult : OfflineQueryBuilderResult
}
