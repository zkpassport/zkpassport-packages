import { Alpha3Code, getAlpha3Code, registerLocale } from "i18n-iso-countries"
import i18en from "i18n-iso-countries/langs/en.json"
import type { CountryName, IDCredential, NumericalIDCredential, Query } from "@zkpassport/utils"

// Country-name normalization needs the English locale registered (idempotent)
registerLocale(i18en)

export function normalizeCountry(country: CountryName | Alpha3Code) {
  if (country === "Zero Knowledge Republic") {
    return "ZKR"
  }
  let normalizedCountry: Alpha3Code | "ZKR" | undefined = undefined
  const alpha3 = getAlpha3Code(country as CountryName, "en") as Alpha3Code | "ZKR" | undefined
  normalizedCountry = alpha3 || (country as Alpha3Code) || "ZKR"
  return normalizedCountry as Alpha3Code | "ZKR"
}

export function numericalCompare(
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

export function rangeCompare(
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

export function generalCompare(
  fnName: "in" | "out" | "eq",
  key: IDCredential,
  value: any, // eslint-disable-line
  requestId: string,
  requestIdToConfig: Record<string, Query>,
) {
  requestIdToConfig[requestId][key] = {
    ...requestIdToConfig[requestId][key],
    [fnName]: value,
  }
}
