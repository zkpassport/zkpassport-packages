import { Suspense } from "react"
import CertificateSearch from "@/components/CertificateSearch"

export default function CertificatesPage() {
  return (
    <div className="container mx-auto py-6 px-4 sm:px-0 sm:py-10">
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Certificate Registry Explorer</h1>
      <Suspense fallback={<div>Loading...</div>}>
        <CertificateSearch />
      </Suspense>
    </div>
  )
}
