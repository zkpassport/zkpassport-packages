import { PackagedCertificate } from "@zkpassport/utils"
import { useMemo } from "react"

const CertificateDetails = ({
  certificatesByCountry,
  selectedCountry,
}: {
  certificatesByCountry: Record<string, PackagedCertificate[]>
  selectedCountry: { code: string; name: string }
}) => {
  // Group certificates by signature scheme
  const groupedCertificates = useMemo(
    () =>
      certificatesByCountry[selectedCountry.code].reduce(
        (acc, cert) => {
          const key = `${cert.signature_algorithm}-${cert.public_key.type}-${cert.hash_algorithm}${"curve" in cert.public_key && cert.public_key.curve ? `-${cert.public_key.curve}` : ""}`
          if (!acc[key]) {
            acc[key] = {
              cert,
              count: 0,
            }
          }
          acc[key].count++
          return acc
        },
        {} as Record<string, { cert: PackagedCertificate; count: number }>,
      ),
    [certificatesByCountry, selectedCountry],
  )

  return (
    <div className="border-t border-border pt-3 mt-3">
      <p className="text-xs font-medium text-muted-foreground mb-2">Certificate Details</p>
      <div className="space-y-2 pb-4">
        {Object.values(groupedCertificates).map(({ cert, count }) => (
          <div
            key={`${cert.signature_algorithm}-${cert.public_key.type}-${cert.hash_algorithm}-${
              "curve" in cert.public_key && cert.public_key.curve ? cert.public_key.curve : ""
            }`}
            className="bg-muted/30 dark:bg-muted/20 rounded p-2"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {cert.signature_algorithm}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    cert.public_key.type === "RSA"
                      ? "text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded-full"
                      : "text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-full"
                  }
                >
                  {cert.public_key.type}
                </span>
                {count > 1 && (
                  <span className="text-xs px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
                    x {count}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {cert.hash_algorithm}{" "}
              {"curve" in cert.public_key && cert.public_key.curve && `• ${cert.public_key.curve}`}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CertificateDetails
