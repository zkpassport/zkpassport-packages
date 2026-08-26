import countries from "i18n-iso-countries"
import en from "i18n-iso-countries/langs/en.json"
import type { AttestPolicy } from "@zkpassport/sdk"

countries.registerLocale(en)

export const HIDDEN_NOTE =
  "Your name, birth date, document number, and photo stay on your device — only the yes/no results are shared."

export function disclosureClaims(policy: AttestPolicy): string[] {
  const claims: string[] = []
  if (policy.minAge > 0) {
    claims.push(`You are ${policy.minAge} or older`)
  }
  if (policy.excludedCountries.length > 0) {
    const names = policy.excludedCountries.map((code) => countries.getName(code, "en") ?? code)
    claims.push(`Your nationality is not ${names.join(", ")}`)
  }
  if (policy.sanctionsCheck) {
    claims.push("You are not on sanctions lists")
  }
  if (policy.saltedNullifierOnly) {
    claims.push("One credential per person (face match required)")
  }
  return claims
}
