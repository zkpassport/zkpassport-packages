import {
  CredentialScheme,
  decideVerificationPaths,
  issueYearRanges,
  listCountries,
  type AllowedCredential,
  type Coverage,
  type CoverageCountryOption,
  type CoverageDecision,
  type IssueYearRange,
} from "@zkpassport/utils"

export type TriageDocumentType = "passport" | "id_card" | "residence_permit"

/** What the user says about the document they will scan, before the phone is involved */
export type Triage = {
  country: string | null
  documentType: TriageDocumentType | null
  issueYear: number | null
}

export const EMPTY_TRIAGE: Triage = { country: null, documentType: null, issueYear: null }

/** Where the ID will be read; the popup learns it from the browser or assumes a phone that can do everything */
export type PhoneOs = "ios" | "android" | "unknown"

export type Verdict =
  /** The document's chip is read over NFC, verifiably */
  | { kind: "chip"; decision: CoverageDecision }
  /** The document's printed page is read with the camera */
  | { kind: "camera"; decision: CoverageDecision }
  /** The country has series with and without a chip */
  | { kind: "ask_year"; ranges: IssueYearRange[] }
  /** The document can't serve this request */
  | {
      kind: "blocked"
      reason: "chipless" | "chipUnverifiable" | "policy" | "unsupported"
      decision: CoverageDecision
    }
  /** Nothing is known yet, or the table doesn't know the country */
  | { kind: "unknown" }

/** The schemes the phone will be able to prove; unknown means a phone that can do everything */
export function schemesFor(os: PhoneOs): CredentialScheme[] {
  return os === "android"
    ? [CredentialScheme.ICAO_CHIP]
    : [CredentialScheme.ICAO_CHIP, CredentialScheme.ATTESTED_CAPTURE_IOS]
}

export function countries(coverage: Coverage): CoverageCountryOption[] {
  return listCountries(coverage)
}

export function triageVerdict(
  coverage: Coverage,
  triage: Triage,
  allowedCredentials: readonly AllowedCredential[] | undefined,
  os: PhoneOs,
): Verdict {
  if (!triage.documentType || !triage.country) return { kind: "unknown" }

  const decision = decideVerificationPaths(coverage, {
    country: triage.country,
    documentType: triage.documentType,
    issueYear: triage.issueYear ?? undefined,
    allowedCredentials,
    supportedSchemes: schemesFor(os),
  })
  switch (decision.outcome) {
    case "unknown":
      return { kind: "unknown" }
    case "ask_issue_year": {
      const ranges = issueYearRanges(coverage, triage.country, triage.documentType)
      return ranges.length > 1 ? { kind: "ask_year", ranges } : { kind: "unknown" }
    }
    case "proceed":
      return decision.paths[0].method === "nfc"
        ? { kind: "chip", decision }
        : { kind: "camera", decision }
    case "rejected_by_policy":
      return {
        kind: "blocked",
        decision,
        reason:
          decision.chip === "none"
            ? "chipless"
            : decision.chip !== "unknown" && !decision.chipVerifiable
              ? "chipUnverifiable"
              : "policy",
      }
    case "unsupported":
      return { kind: "blocked", decision, reason: "unsupported" }
  }
}

/** Whether the request can go ahead with what the user said */
export function canContinue(verdict: Verdict): boolean {
  return verdict.kind !== "blocked" && verdict.kind !== "ask_year"
}

export type Lane = "r" | "c"

/**
 * The App Clip lane reads a chip and nothing else, so only a document the table sends to its
 * chip goes there, and only when the relying party allows the lane and the phone is not Android.
 */
export function laneFor(verdict: Verdict, appClipAllowed: boolean, os: PhoneOs): Lane {
  return appClipAllowed && os !== "android" && verdict.kind === "chip" ? "c" : "r"
}

/** The request URL on the given lane */
export function withLane(requestUrl: string, lane: Lane): string {
  const url = new URL(requestUrl)
  url.pathname = `/${lane}`
  return url.toString()
}

/** The request URL carrying what the user said, so the app can skip asking */
export function withTriage(requestUrl: string, triage: Triage): string {
  const url = new URL(requestUrl)
  if (triage.country) url.searchParams.set("dc", triage.country)
  if (triage.documentType) url.searchParams.set("dd", triage.documentType)
  if (triage.issueYear) url.searchParams.set("dy", String(triage.issueYear))
  return url.toString()
}

export function requestUrlFor(
  requestUrl: string,
  triage: Triage,
  verdict: Verdict,
  { appClipAllowed, os }: { appClipAllowed: boolean; os: PhoneOs },
): string {
  return withTriage(withLane(requestUrl, laneFor(verdict, appClipAllowed, os)), triage)
}

export function isAppClipLane(requestUrl: string | null): boolean {
  if (!requestUrl) return false
  try {
    return new URL(requestUrl).pathname === "/c"
  } catch {
    return false
  }
}
