import type { ECPublicKey, PackagedCertificate, RSAPublicKey } from "@zkpassport/utils"
export { getCurveName } from "@zkpassport/utils/cms"
import { format } from "date-fns"

// Determine if a certificate uses RSA (either RSA-PKCS or RSA-PSS)
export const isRSA = (
  cert: PackagedCertificate,
): cert is PackagedCertificate & { public_key: RSAPublicKey } => {
  return isRSAPKCS(cert) || isRSAPSS(cert)
}

// Determine if packaged certificate uses RSA-PKCS
export const isRSAPKCS = (cert: PackagedCertificate): boolean => {
  return cert.signature_algorithm === "RSA"
}

// Determine if packaged certificate uses RSA-PSS
export const isRSAPSS = (cert: PackagedCertificate): boolean => {
  return cert.signature_algorithm === "RSA-PSS"
}

// Determine if a packaged certificate uses ECDSA
export const isECDSA = (
  cert: PackagedCertificate,
): cert is PackagedCertificate & { public_key: ECPublicKey } => {
  return cert.signature_algorithm === "ECDSA"
}

// Format timestamp to readable date
export const formatTimestamp = (timestamp: number): string => {
  return format(new Date(timestamp * 1000), "PPP")
}

// Truncate string with ellipsis
export const truncate = (str: string, length = 20): string => {
  return str.length > length ? `${str.substring(0, length)}...` : str
}
