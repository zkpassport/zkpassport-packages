import { PackagedCertificate } from "@zkpassport/utils"

const CertificateDetails = ({
  certificatesByCountry,
  selectedCountry,
}: {
  certificatesByCountry: Record<string, PackagedCertificate[]>
  selectedCountry: { code: string; name: string }
}) => {
  // Group certificates by signature scheme
  const groupedCertificates = certificatesByCountry[selectedCountry.code].reduce(
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
  )

  return (
    <div className="border-t pt-3 mt-3">
      <p className="text-xs font-medium text-gray-600 mb-2">Certificate Details</p>
      <div className="space-y-2 pb-4">
        {Object.values(groupedCertificates).map(({ cert, count }) => (
          <div
            key={`${cert.signature_algorithm}-${cert.public_key.type}-${cert.hash_algorithm}`}
            className="bg-gray-50 rounded p-2"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-700">
                  {cert.signature_algorithm}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    cert.public_key.type === "RSA"
                      ? "text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full"
                      : "text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full"
                  }
                >
                  {cert.public_key.type}
                </span>
                {count > 1 && (
                  <span className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded">
                    x {count}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600">
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
