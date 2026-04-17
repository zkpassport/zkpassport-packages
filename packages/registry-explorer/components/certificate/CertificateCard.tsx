"use client"

import type { PackagedCertificate } from "@zkpassport/utils"
import {
  countryCodeAlpha3ToName,
  countryCodeAlpha3ToAlpha2,
  BRAINPOOL_CURVES_ABBR,
} from "@zkpassport/utils"
import { formatTimestamp, isRSA, isECDSA } from "@/lib/certificate-utils"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Shield,
  Key,
  Clock,
  Globe,
  FileCheck,
} from "lucide-react"
import { useState } from "react"

/* prettier-ignore */
const FLAG_CLR: Record<string, string> = (() => {
  const R = "#ef4444", B = "#3b82f6", G = "#22c55e", Y = "#eab308", O = "#f97316", C = "#06b6d4"
  return {
    AFG:R,ALB:R,DZA:G,AND:B,AGO:R,ATG:R,ARG:C,ARM:O,AUS:B,AUT:R,
    AZE:B,BHS:C,BHR:R,BGD:G,BRB:B,BLR:R,BEL:Y,BLZ:B,BEN:G,BTN:O,
    BOL:G,BIH:B,BWA:C,BRA:G,BRN:Y,BGR:G,BFA:G,BDI:R,CPV:B,KHM:B,
    CMR:G,CAN:R,CAF:B,TCD:B,CHL:R,CHN:R,COL:Y,COM:B,COG:G,COD:B,
    CRI:B,CIV:O,HRV:R,CUB:B,CYP:O,CZE:B,DNK:R,DJI:C,DMA:G,DOM:B,
    ECU:Y,EGY:R,SLV:B,GNQ:G,ERI:B,EST:B,SWZ:B,ETH:G,FJI:C,FIN:B,
    FRA:B,GAB:G,GMB:R,GEO:R,DEU:R,GHA:G,GRC:B,GRD:R,GTM:B,GIN:R,
    GNB:R,GUY:G,HTI:B,HND:B,HUN:R,ISL:B,IND:O,IDN:R,IRN:G,IRQ:R,
    IRL:G,ISR:B,ITA:G,JAM:G,JPN:R,JOR:G,KAZ:C,KEN:R,KIR:R,PRK:B,
    KOR:B,KWT:G,KGZ:R,LAO:R,LVA:R,LBN:R,LSO:B,LBR:R,LBY:G,LIE:B,
    LTU:Y,LUX:B,MDG:G,MWI:R,MYS:B,MDV:R,MLI:G,MLT:R,MHL:B,MRT:G,
    MUS:R,MEX:G,FSM:B,MDA:B,MCO:R,MNG:R,MNE:R,MAR:R,MOZ:G,MMR:Y,
    NAM:B,NRU:B,NPL:R,NLD:O,NZL:B,NIC:B,NER:O,NGA:G,MKD:R,NOR:R,
    OMN:R,PAK:G,PLW:B,PSE:G,PAN:B,PNG:R,PRY:B,PER:R,PHL:B,POL:R,
    PRT:G,QAT:R,ROU:B,RUS:B,RWA:B,KNA:G,LCA:C,VCT:G,WSM:R,SMR:B,
    STP:G,SAU:G,SEN:G,SRB:R,SYC:B,SLE:G,SGP:R,SVK:B,SVN:B,SLB:B,
    SOM:B,ZAF:G,SSD:G,ESP:R,LKA:R,SDN:G,SUR:G,SWE:B,CHE:R,SYR:R,
    TWN:R,TJK:R,TZA:G,THA:B,TLS:R,TGO:G,TON:R,TTO:R,TUN:R,TUR:R,
    TKM:G,TUV:C,UGA:Y,UKR:B,ARE:G,GBR:B,USA:B,URY:B,UZB:B,VUT:R,
    VAT:Y,VEN:Y,VNM:R,YEM:R,ZMB:G,ZWE:G,
  }
})()

const SQUARE_FLAGS = new Set(["CHE", "VAT"])

function flagColor(alpha3: string): string | undefined {
  return FLAG_CLR[alpha3.toUpperCase()]
}

function countryFlag(alpha3: string): string {
  const alpha2 = countryCodeAlpha3ToAlpha2(alpha3)
  if (!alpha2 || alpha2.length !== 2) return ""
  return String.fromCodePoint(
    ...[...alpha2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  )
}

const normalizeTags = (tags?: string[]): string[] =>
  (tags || []).map((tag: string) => (tag === "ICAO" ? "UN" : tag))

function truncateHex(value: string, chars = 10): string {
  const hex = value.startsWith("0x") ? value : `0x${value}`
  if (hex.length <= 2 + chars * 2) return hex
  return `${hex.slice(0, 2 + chars)}...${hex.slice(-chars)}`
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCopy}
            className="inline-flex p-1 rounded hover:bg-muted transition-colors"
            aria-label={label}
          >
            {copied ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Copy size={14} className="text-muted-foreground" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? "Copied!" : label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function CertificateCard({ cert }: { cert: PackagedCertificate }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const countryName = countryCodeAlpha3ToName(cert.country)
  const tags = normalizeTags(cert.tags)
  const flag = countryFlag(cert.country)
  const tint = flagColor(cert.country)
  const cardBorderBackground = tint
    ? `linear-gradient(to right, rgba(0, 0, 0, 0.20) 0%, rgba(0, 0, 0, 0.20) 65%, ${tint} 85%, ${tint} 100%)`
    : "#e5e7eb"

  const algoDesc = (() => {
    if (isECDSA(cert)) {
      const curve = cert.public_key.curve || ""
      return BRAINPOOL_CURVES_ABBR[curve as keyof typeof BRAINPOOL_CURVES_ABBR] ?? curve
    }
    const algo = cert.signature_algorithm || ""
    if (isRSA(cert)) return `${algo}-${cert.public_key.key_size || ""}`.trim()
    return algo || "Unknown"
  })()

  const validityStr =
    cert.validity?.not_before && cert.validity?.not_after
      ? `${new Date(cert.validity.not_before * 1000).toLocaleDateString("en-GB")} to ${new Date(cert.validity.not_after * 1000).toLocaleDateString("en-GB")}`
      : ""

  const isExpired = cert.validity?.not_after ? cert.validity.not_after * 1000 < Date.now() : false

  return (
    <div
      className="group relative rounded-lg overflow-hidden transition-shadow hover:shadow-md p-px"
      style={{ background: cardBorderBackground }}
    >
      <div className="relative bg-white dark:bg-gray-800 rounded-[calc(0.5rem-1px)] overflow-hidden">
        {tint && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity group-hover:opacity-150"
            style={{
              background: `linear-gradient(to left, ${tint}18, transparent 60%)`,
            }}
          />
        )}
        {/* Collapsed header row */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="relative w-full p-3 sm:p-4 flex items-center gap-2 sm:gap-3 text-left cursor-pointer transition-colors"
        >
          {flag && (
            <span
              className="pointer-events-none absolute top-1/2 -translate-y-1/2 select-none text-[128px] leading-none opacity-[0.3] transition-opacity group-hover:opacity-[0.6]"
              style={{
                right: SQUARE_FLAGS.has(cert.country) ? "-1.8rem" : "-0.5rem",
                maskImage: "linear-gradient(to left, black 0%, transparent 90%)",
                WebkitMaskImage: "linear-gradient(to left, black 0%, transparent 90%)",
              }}
              aria-hidden="true"
            >
              {flag}
            </span>
          )}
          <FileCheck size={14} className="flex-shrink-0 text-muted-foreground" />

          <span
            className="font-semibold text-sm text-gray-900 dark:text-white flex-shrink-0 [text-shadow:1px_1px_4px_white,1px_1px_1px_white] dark:[text-shadow:1px_1px_4px_#1f2937,1px_1px_1px_#1f2937]"
          >
            {countryName}{" "}
            <span className="font-normal text-muted-foreground">({cert.country})</span>
          </span>

          <Badge variant="outline" className="flex-shrink-0 text-[10px] px-1.5 py-0 cursor-pointer">
            {algoDesc}
          </Badge>

          {validityStr && (
            <span className="hidden lg:inline text-xs text-muted-foreground truncate">
              {validityStr}
            </span>
          )}

          {isExpired && (
            <span className="ml-2 inline-flex items-center px-[3px] py-[2px] rounded text-[8px] leading-none font-semibold bg-red-100/75 text-red-700/75 dark:bg-red-900/40 dark:text-red-400 border border-red-200 dark:border-red-800">
              Expired
            </span>
          )}

          <span className="flex-1" />

          {tags.length > 0 && (
            <span className="relative z-10 hidden sm:flex flex-shrink-0 items-center gap-[3px]">
              {tags.map((tag, index) => (
                <span
                  key={`${tag}-${index}`}
                  className="inline-flex items-center rounded-[4px] border border-gray-300 dark:border-gray-500 bg-gray-100/75 dark:bg-gray-700/75 px-1 py-[1px] text-[10px] leading-none font-medium text-gray-700 dark:text-gray-100"
                >
                  {tag}
                </span>
              ))}
            </span>
          )}

          {isExpanded ? (
            <ChevronUp className="-ml-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="-ml-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          )}
        </button>

        {/* Expanded details */}
        {isExpanded && (
          <div className="px-4 sm:px-5 py-4">
            {/* Top section: overview */}
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Shield size={24} className="text-gray-400 dark:text-gray-600 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Algorithm</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {cert.signature_algorithm}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Key size={24} className="text-gray-400 dark:text-gray-600 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Key</div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {cert.public_key.type} {cert.public_key.key_size}
                    {isECDSA(cert) && cert.public_key.curve && (
                      <span className="text-muted-foreground"> ({cert.public_key.curve})</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Clock size={24} className="text-gray-400 dark:text-gray-600 flex-shrink-0" />
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Validity</div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {formatTimestamp(cert.validity.not_before)}
                    <span className="text-muted-foreground mx-1">to</span>
                    {formatTimestamp(cert.validity.not_after)}
                  </div>
                </div>
              </div>
            </div>

            {/* Public key details */}
            {isRSA(cert) && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-5">
                <span className="font-medium flex-shrink-0">Public Key</span>
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">n:</span>
                  <code className="font-mono text-[11px]">
                    {truncateHex(cert.public_key.modulus)}
                  </code>
                  <CopyButton text={cert.public_key.modulus} label="Copy modulus" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">e:</span>
                  <code className="font-mono text-[11px]">{cert.public_key.exponent}</code>
                </span>
              </div>
            )}

            {isECDSA(cert) && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-5">
                <span className="font-medium flex-shrink-0">Public Key</span>
                {cert.public_key.public_key_x && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">x:</span>
                    <code className="font-mono text-[11px]">
                      {truncateHex(cert.public_key.public_key_x)}
                    </code>
                    <CopyButton text={cert.public_key.public_key_x} label="Copy X coordinate" />
                  </span>
                )}
                {cert.public_key.public_key_y && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">y:</span>
                    <code className="font-mono text-[11px]">
                      {truncateHex(cert.public_key.public_key_y)}
                    </code>
                    <CopyButton text={cert.public_key.public_key_y} label="Copy Y coordinate" />
                  </span>
                )}
              </div>
            )}

            {/* Identifiers */}
            {(cert.subject_key_identifier || cert.authority_key_identifier || cert.fingerprint) && (
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mt-1.5">
                {cert.fingerprint && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">Fingerprint:</span>
                    <code className="font-mono text-[11px]">{truncateHex(cert.fingerprint)}</code>
                    <CopyButton text={cert.fingerprint} label="Copy fingerprint" />
                  </span>
                )}
                {cert.subject_key_identifier && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">SKI:</span>
                    <code className="font-mono text-[11px]">
                      {truncateHex(cert.subject_key_identifier)}
                    </code>
                    <CopyButton
                      text={cert.subject_key_identifier}
                      label="Copy subject key identifier"
                    />
                  </span>
                )}
                {cert.authority_key_identifier && (
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium">AKI:</span>
                    <code className="font-mono text-[11px]">
                      {truncateHex(cert.authority_key_identifier)}
                    </code>
                    <CopyButton
                      text={cert.authority_key_identifier}
                      label="Copy authority key identifier"
                    />
                  </span>
                )}
              </div>
            )}

            {tags.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4">
                <Globe size={12} className="flex-shrink-0" />
                <span className="font-medium">Masterlists:</span>
                <span>{tags.join(", ")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
