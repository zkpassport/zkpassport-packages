import type { ReactNode } from "react"
import type { Chain, Hex } from "viem"

import { explorerTxUrl, shortHex } from "./format"

export function Hint({ children }: { children: ReactNode }) {
  return <p className="zkp-intro-question-hint">{children}</p>
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

export type Row = {
  label: string
  value: ReactNode
  // Puts the value on its own line, for values too long to sit next to the label
  stacked?: boolean
}

export function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="zkp-flow-rows">
      {rows.map((row) => (
        <div key={row.label} className="zkp-flow-row" data-stacked={row.stacked ? "" : undefined}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Primary({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="zkp-intro-continue" onClick={onClick}>
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

export function TxLink({ chain, hash, label }: { chain: Chain; hash: Hex; label?: string }) {
  const text = label ?? shortHex(hash)
  const url = explorerTxUrl(chain, hash)
  if (!url) return <>{text}</>
  return (
    <a className="zkp-flow-link" href={url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  )
}
