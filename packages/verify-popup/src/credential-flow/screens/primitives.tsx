import { useEffect, useState, type ReactNode } from "react"
import type { Chain, Hex } from "viem"

import { explorerAddressUrl, explorerTxUrl, shortHex } from "./format"
import { ICON_COPY, ICON_EXTERNAL, ICON_SPINNER } from "./icons"

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

/** Everything a step has to say, above the button. */
export function Main({ children }: { children: ReactNode }) {
  return <div className="zkp-flow-main">{children}</div>
}

/** What this step is for, in one line each. */
export function Heading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="zkp-flow-heading">
      <p className="zkp-flow-title">{title}</p>
      {hint ? <p className="zkp-flow-hint">{hint}</p> : null}
    </div>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return <p className="zkp-flow-title">{children}</p>
}

/** Small print under the panel: what is being saved, or what just went wrong. */
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

/** Sits at the foot of the card and holds the one thing to do next. */
export function Actions({ children }: { children: ReactNode }) {
  return <div className="zkp-flow-actions">{children}</div>
}

export function Primary({
  icon,
  busy,
  onClick,
  children,
}: {
  icon?: string
  busy?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className="zkp-intro-continue" disabled={busy} onClick={onClick}>
      {busy ? <Glyph icon={ICON_SPINNER} spin /> : icon ? <Glyph icon={icon} /> : null}
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

export function Address({ value }: { value: string }) {
  return <span className="zkp-flow-address">{shortHex(value)}</span>
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

/** A revert reason or RPC failure, kept short on screen and easy to hand over. */
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

export function AddressLink({ chain, address }: { chain: Chain; address: `0x${string}` }) {
  const url = explorerAddressUrl(chain, address)
  if (!url) return <Address value={address} />
  return (
    <a className="zkp-flow-link" href={url} target="_blank" rel="noopener noreferrer">
      <Address value={address} />
    </a>
  )
}

export function TxLink({ chain, hash, label }: { chain: Chain; hash: Hex; label: string }) {
  const url = explorerTxUrl(chain, hash)
  if (!url) return <Address value={hash} />
  return (
    <a className="zkp-flow-link" href={url} target="_blank" rel="noopener noreferrer">
      {label}
      <Glyph icon={ICON_EXTERNAL} after />
    </a>
  )
}
