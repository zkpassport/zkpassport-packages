import { useEffect, useState, type ReactNode } from "react"
import type { Chain, Hex } from "viem"

import { explorerAddressUrl, explorerTxUrl, shortHex } from "./format"
import { ICON_CHECK, ICON_COPY, ICON_EXTERNAL, ICON_SPINNER } from "./icons"

// Sized in em, so every glyph matches the text it sits with
function Glyph({ icon, after, spin }: { icon: string; after?: boolean; spin?: boolean }) {
  return (
    <span
      className={spin ? "zkp-flow-glyph zkp-flow-spinner" : "zkp-flow-glyph"}
      data-after={after ? "" : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  )
}

export function Main({ children }: { children: ReactNode }) {
  return <div className="zkp-flow-main">{children}</div>
}

export function Heading({
  title,
  hint,
  badge,
}: {
  title: string
  hint?: string
  badge?: ReactNode
}) {
  return (
    <div className="zkp-flow-heading">
      {badge}
      <p className="zkp-flow-title">{title}</p>
      {hint ? (
        <p className="zkp-flow-hint" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/** Small print under the panel; `alert` turns it into a warning. */
export function Note({ alert, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <p
      className="zkp-flow-note"
      data-tone={alert ? "alert" : undefined}
      role={alert ? "status" : undefined}
    >
      {children}
    </p>
  )
}

export function VerifiedBadge() {
  return (
    <p className="zkp-flow-badge">
      <Glyph icon={ICON_CHECK} />
      ID verified
    </p>
  )
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="zkp-flow-actions">{children}</div>
}

export function Primary({
  busy,
  onClick,
  children,
}: {
  busy?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="zkp-intro-continue" disabled={busy} onClick={onClick}>
      {busy ? <Glyph icon={ICON_SPINNER} spin /> : null}
      {children}
    </button>
  )
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="zkp-flow-panel">{children}</div>
}

export type Row = {
  label: string
  value: ReactNode
}

export function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="zkp-flow-rows">
      {rows.map((row) => (
        <div key={row.label} className="zkp-flow-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** An address, shortened; `chip` sets it on a plate of its own. */
export function Address({ value, chip }: { value: string; chip?: boolean }) {
  return (
    <span className="zkp-flow-address" data-chip={chip ? "" : undefined} title={value}>
      {shortHex(value)}
    </span>
  )
}

/** An explorer link: the text, then the mark that says it leaves the popup. */
function ExplorerLink({
  url,
  text,
  title,
  address,
  quiet,
}: {
  url: string
  text: string
  title?: string
  address?: boolean
  quiet?: boolean
}) {
  return (
    <a
      className={address ? "zkp-flow-link zkp-flow-address" : "zkp-flow-link"}
      data-quiet={quiet ? "" : undefined}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
    >
      {text}
      <Glyph icon={ICON_EXTERNAL} after />
    </a>
  )
}

/** The address on the chain's explorer; `chip` sets it on a plate of its own. */
export function AddressLink({
  chain,
  address,
  chip,
}: {
  chain: Chain
  address: `0x${string}`
  chip?: boolean
}) {
  const url = explorerAddressUrl(chain, address)
  if (!url) return <Address value={address} chip={chip} />
  if (!chip) return <ExplorerLink url={url} text={shortHex(address)} title={address} address />
  return (
    <a
      className="zkp-flow-address"
      data-chip=""
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
    >
      {shortHex(address)}
    </a>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Anything shown next to this button stays selectable, so a blocked
      // clipboard still leaves a way to copy
    }
  }

  return (
    <button
      type="button"
      className="zkp-flow-iconbtn"
      onClick={copy}
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
    >
      <Glyph icon={ICON_COPY} />
    </button>
  )
}

/** A revert reason or RPC failure, capped on screen and easy to copy. */
export function ErrorDetail({ text }: { text: string }) {
  return (
    <div className="zkp-flow-detail-block">
      <p className="zkp-flow-detail" role="alert">
        {text}
      </p>
      <CopyButton text={text} label="Copy the details" />
    </div>
  )
}

/** Without a label the shortened hash is the link text. */
export function TxLink({
  chain,
  hash,
  label,
  quiet,
}: {
  chain: Chain
  hash: Hex
  label?: string
  quiet?: boolean
}) {
  const url = explorerTxUrl(chain, hash)
  if (!url) return <Address value={hash} />
  return <ExplorerLink url={url} text={label ?? shortHex(hash)} quiet={quiet} />
}
