"use client"

import { Suspense } from "react"
import { useHistoricalCertificateRoots } from "@/hooks/useHistoricalCertificateRoots"
import { CertificateRootCard } from "@/components/CertificateRootCard"
import { LoadingAnimation } from "@/components/LoadingAnimation"

function HistoricalRootsContent() {
  const { roots, isLoading, error } = useHistoricalCertificateRoots()

  if (error) {
    return (
      <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 my-4">
        <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error Loading Roots</h3>
        <div className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {isLoading && roots.length === 0 ? (
        <div className="flex justify-center items-center py-12">
          <LoadingAnimation />
        </div>
      ) : roots.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No historical roots found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roots.map((root) => (
            <CertificateRootCard key={root.root} rootDetails={root} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function HistoricalRootsPage() {
  return (
    <div className="container mx-auto py-10">
      <h1 className="text-2xl font-bold mb-2">Historical Certificate Roots</h1>
      <p className="text-muted-foreground mb-6">
        Browse all historical certificate roots stored in the registry
      </p>

      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <LoadingAnimation />
          </div>
        }
      >
        <HistoricalRootsContent />
      </Suspense>
    </div>
  )
}
