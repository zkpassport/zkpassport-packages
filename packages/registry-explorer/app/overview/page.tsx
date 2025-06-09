"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useRegistryInfo } from "@/hooks/useRegistryInfo"
import { AlertCircle, Copy } from "lucide-react"
import { useState } from "react"

export default function InfoPage() {
  const {
    rootRegistryAddress,
    certificateRegistryAddress,
    circuitRegistryAddress,
    latestCertificateRoot,
    latestCircuitRoot,
    latestCertificateRootDetails,
    latestCircuitRootDetails,
    isLoading,
    error,
  } = useRegistryInfo()

  return (
    <div className="container mx-auto py-6 px-4 sm:py-10">
      <h1 className="text-xl sm:text-2xl font-bold mb-6">Registry Overview</h1>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col space-y-6">
        <AddressCard title="Root Registry" address={rootRegistryAddress} isLoading={isLoading} />

        <AddressCard
          title="Certificate Registry"
          address={certificateRegistryAddress}
          rootHash={latestCertificateRoot}
          rootDetails={latestCertificateRootDetails}
          isLoading={isLoading}
          registryType="certificate"
        />

        <AddressCard
          title="Circuit Registry"
          address={circuitRegistryAddress}
          rootHash={latestCircuitRoot}
          rootDetails={latestCircuitRootDetails}
          isLoading={isLoading}
          registryType="circuit"
        />
      </div>
    </div>
  )
}

interface AddressCardProps {
  title: string
  address?: string
  rootHash?: string
  rootDetails?: import("@zkpassport/registry").RootDetails
  isLoading: boolean
  registryType?: "root" | "certificate" | "circuit"
}

function AddressCard({
  title,
  address,
  rootHash,
  rootDetails,
  isLoading,
  registryType = "root",
}: AddressCardProps) {
  const [copied, setCopied] = useState(false)
  const [copiedRoot, setCopiedRoot] = useState(false)

  const copyToClipboard = (text: string, setCopiedState: (copied: boolean) => void) => {
    navigator.clipboard.writeText(text)
    setCopiedState(true)
    setTimeout(() => setCopiedState(false), 2000)
  }

  // Determine the appropriate label based on registry type
  const getLeavesLabel = () => {
    if (registryType === "certificate") return "Certificates"
    if (registryType === "circuit") return "Circuits"
    return "Leaves"
  }

  return (
    <Card className="bg-muted/30">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Address</p>
            {isLoading ? (
              <Skeleton className="h-8 mt-3 mb-1 w-full" />
            ) : address ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="bg-muted p-2 rounded text-xs break-all flex-1">{address}</code>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(address, setCopied)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? "Copied!" : "Copy to clipboard"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <span className="text-muted-foreground italic">Not available</span>
            )}
          </div>

          {registryType !== "root" && (rootHash || isLoading) && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Latest Root</p>
              {isLoading ? (
                <Skeleton className="h-8 mt-3 mb-1 w-full" />
              ) : rootHash ===
                "0x0000000000000000000000000000000000000000000000000000000000000000" ? (
                <span className="text-muted-foreground italic">Not available</span>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <code className="bg-muted p-2 rounded text-xs break-all flex-1">{rootHash}</code>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(rootHash!, setCopiedRoot)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {copiedRoot ? "Copied!" : "Copy to clipboard"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          )}
        </div>

        {rootDetails && (
          <div className="border-t pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{getLeavesLabel()}</p>
                <p>{rootDetails.leaves}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Last Updated</p>
                <p>{rootDetails.validFrom.toISOString().split("T")[0]}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
