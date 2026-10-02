import type { ReactNode } from "react"
import type { Address, Chain, Hex } from "viem"

import { ICON_CHECK, ICON_EXTERNAL, ICON_SPINNER } from "../shared/icons"

// Sized in em, so every glyph matches the text it sits with
function Glyph({ icon, after, spin }: { icon: string; after?: boolean; spin?: boolean }) {
  return (
    <span
      className={spin ? "flow-glyph flow-spinner" : "flow-glyph"}
      data-after={after ? "" : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  )
}

export function Main({ children }: { children: ReactNode }) {
  return <div className="flow-main">{children}</div>
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
    <div className="flow-heading">
      {badge}
      <p className="flow-title">{title}</p>
      {hint ? (
        <p className="flow-hint" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Note({ alert, children }: { alert?: boolean; children: ReactNode }) {
  return (
    <p
      className="flow-note"
      data-tone={alert ? "alert" : undefined}
      role={alert ? "status" : undefined}
    >
      {children}
    </p>
  )
}

export function VerifiedBadge() {
  return (
    <p className="flow-badge">
      <Glyph icon={ICON_CHECK} />
      ID verified
    </p>
  )
}

export function Actions({ children }: { children: ReactNode }) {
  return <div className="flow-actions">{children}</div>
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
    <button type="button" className="flow-primary" disabled={busy} onClick={onClick}>
      {busy ? <Glyph icon={ICON_SPINNER} spin /> : null}
      {children}
    </button>
  )
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="flow-panel">{children}</div>
}

export type Row = {
  label: string
  value: ReactNode
}

export function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="flow-rows">
      {rows.map((row) => (
        <div key={row.label} className="flow-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Address({ value, chip }: { value: string; chip?: boolean }) {
  return (
    <span className="flow-address" data-chip={chip ? "" : undefined} title={value}>
      {shortHex(value)}
    </span>
  )
}

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
      className={address ? "flow-link flow-address" : "flow-link"}
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
      className="flow-address"
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

export function ErrorDetail({ text }: { text: string }) {
  return (
    <p className="flow-detail" role="alert">
      {text}
    </p>
  )
}

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

export function shortHex(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

function explorerUrl(chain: Chain, path: string): string | null {
  const base = chain.blockExplorers?.default.url
  return base ? `${base.replace(/\/$/, "")}/${path}` : null
}

export function explorerTxUrl(chain: Chain, hash: Hex): string | null {
  return explorerUrl(chain, `tx/${hash}`)
}

export function explorerAddressUrl(chain: Chain, address: Address): string | null {
  return explorerUrl(chain, `address/${address}`)
}

// Wagmi names the plain injected connector "Injected", which says nothing to
// someone who only knows the wallet by the extension in their browser.
export function walletLabel(connector: { id: string; name: string } | undefined): string {
  if (!connector) return "Connected wallet"
  return connector.id === "injected" ? "Browser wallet" : connector.name
}
