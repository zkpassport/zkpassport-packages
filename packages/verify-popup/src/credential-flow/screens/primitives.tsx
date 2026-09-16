import { useEffect, useState, type ReactNode } from "react"
import type { Chain, Hex } from "viem"

import { explorerAddressUrl, explorerTxUrl, shortHex } from "./format"
import { ICON_EXTERNAL, ICON_SPINNER } from "./icons"

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

export function Hint({ children }: { children: ReactNode }) {
  return <p className="zkp-intro-question-hint">{children}</p>
}

/** Sits at the bottom of the card, so the button stays put as the screen changes. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="zkp-flow-actions">{children}</div>
}

export function Title({ children }: { children: ReactNode }) {
  return <p className="zkp-flow-title">{children}</p>
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="zkp-flow-status" role="status">
      {children}
    </p>
  )
}

/** A step that is under way, so the wait reads as progress rather than a dead screen. */
export function Working({ children }: { children: ReactNode }) {
  return (
    <p className="zkp-flow-status" role="status">
      <Glyph icon={ICON_SPINNER} spin />
      {children}
    </p>
  )
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

/** The one fact a screen is about, address included. */
export function Statement({ children }: { children: ReactNode }) {
  return <p className="zkp-flow-statement">{children}</p>
}

/** Small print under the statement. */
export function Meta({ children }: { children: ReactNode }) {
  return <p className="zkp-flow-meta">{children}</p>
}

export function Primary({
  icon,
  onClick,
  children,
}: {
  icon?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="zkp-intro-continue" onClick={onClick}>
      {icon ? <Glyph icon={icon} /> : null}
      {children}
    </button>
  )
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="zkp-intro-link" onClick={onClick}>
      {children}
    </button>
  )
}

export function CopyButton({ text, label }: { text: string; label: string }) {
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
    <button type="button" className="zkp-flow-copy" onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  )
}

/** A revert reason or RPC failure, kept short on screen and easy to hand over. */
export function ErrorDetail({ text }: { text: string }) {
  return (
    <div className="zkp-flow-detail-block">
      <p className="zkp-flow-detail" role="alert">
        {text}
      </p>
      <CopyButton text={text} label="Copy" />
    </div>
  )
}

export function AddressLink({ chain, address }: { chain: Chain; address: `0x${string}` }) {
  const text = <span className="zkp-flow-address">{shortHex(address)}</span>
  const url = explorerAddressUrl(chain, address)
  if (!url) return text
  return (
    <a className="zkp-flow-link" href={url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  )
}

export function TxLink({ chain, hash, label }: { chain: Chain; hash: Hex; label?: string }) {
  const text = label ?? <span className="zkp-flow-address">{shortHex(hash)}</span>
  const url = explorerTxUrl(chain, hash)
  if (!url) return <>{text}</>
  return (
    <a className="zkp-flow-link" href={url} target="_blank" rel="noopener noreferrer">
      {text}
      <Glyph icon={ICON_EXTERNAL} after />
    </a>
  )
}
