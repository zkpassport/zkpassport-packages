import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { RootDetails } from "@zkpassport/registry"
import { Copy } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

interface CertificateRootCardProps {
  rootDetails: RootDetails
}

export function CertificateRootCard({ rootDetails }: CertificateRootCardProps) {
  const [copied, setCopied] = useState(false)
  const { root, revoked, validFrom, validTo, cid, leaves, isLatest, index } = rootDetails

  function formatCid(cid: string): string {
    if (!cid) return ""
    return `${cid.slice(0, 10)}...${cid.slice(-8)}`
  }

  // Function to truncate root hash for display
  function truncateRootHash(hash: string): string {
    if (!hash) return ""
    if (hash.length <= 20) return hash
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`
  }

  // Function to copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Determine if this is the genesis root
  const isGenesisRoot = index === 1

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-mono">
            {isLatest ? "Current Root" : "Historical Root"}
          </CardTitle>
          <div className="flex items-center gap-2">
            {revoked && <Badge variant="destructive">Revoked</Badge>}
            {isLatest && (
              <Badge
                variant="secondary"
                className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100"
              >
                Latest
              </Badge>
            )}
            {isGenesisRoot && (
              <Badge
                variant="secondary"
                className="bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-100"
              >
                Genesis
              </Badge>
            )}
          </div>
        </div>
        <CardDescription>
          <div className="flex items-center gap-2 font-mono text-xs mt-1">
            <span>{truncateRootHash(root)}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => copyToClipboard(root)}
                    className="inline-flex p-1 rounded hover:bg-muted transition-colors"
                    aria-label="Copy root hash to clipboard"
                  >
                    <Copy size={14} className={copied ? "text-green-500" : ""} />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm break-all">
                  <p>{copied ? "Copied!" : root}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-1">
            <div className="font-semibold">Validity Period:</div>
            <div className="col-span-2">
              {validFrom.toLocaleDateString()} to{" "}
              {validTo !== undefined ? validTo.toLocaleDateString() : "Present"}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div className="font-semibold">IPFS CID:</div>
            <div className="col-span-2 font-mono">
              <Link href={`https://ipfs.infura.io/ipfs/${cid}`} target="_blank">
                {formatCid(cid)}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <div className="font-semibold">Certificates:</div>
            <div className="col-span-2">{leaves ? leaves.toString() : "0"}</div>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link href={`/certificates?root=${encodeURIComponent(root)}`}>Show Certificates</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
