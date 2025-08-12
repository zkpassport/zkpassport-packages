import { PackagedCertificate } from "@zkpassport/utils"

const CertificateSummary = ({
  certificates,
  certificatesByCountry,
}: {
  certificates: PackagedCertificate[]
  certificatesByCountry: Record<string, PackagedCertificate[]>
}) => {
  return (
    <div className="bg-blue-50 rounded-lg p-4 mb-6">
      <div className="text-center">
        <p className="text-3xl font-bold text-blue-900">{certificates.length}</p>
        <p className="text-sm text-blue-700">Total Certificates</p>
      </div>
      <div className="mt-3 text-center">
        <p className="text-lg font-semibold text-blue-800">
          {Object.keys(certificatesByCountry).length}
        </p>
        <p className="text-xs text-blue-600">Countries Covered</p>
      </div>
    </div>
  )
}

export default CertificateSummary
