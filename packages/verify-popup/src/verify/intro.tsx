import { describeQuery, type QueryDescriptionItem } from "@zkpassport/ui/hosted"
import type { Query } from "@zkpassport/sdk"

import { ICON_CHECK, ICON_EPASSPORT_CHIP } from "../shared/icons"
import { Main } from "../shared/controls"

const SKELETON_ROWS = 2

// A preview: the mobile app shows the consent screen that actually binds
export function Intro({
  appName,
  query,
  purpose,
  onContinue,
}: {
  appName: string
  query: Query | null
  purpose?: string
  onContinue: () => void
}) {
  const items = query ? describeQuery(query) : null

  return (
    <div className="flow-body">
      <Main>
        <p className="flow-lede">
          {appName} uses ZKPassport to verify your identity privately. Your ID is checked on your
          phone, and its details never reach a server.
        </p>

        <div className="intro-asks">
          <p className="intro-asks-head">{appName} wants to verify</p>
          {items ? <Asks items={items} purpose={purpose} /> : <AsksLoading />}
        </div>

        <div className="intro-chip">
          <span
            className="intro-chip-mark"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: ICON_EPASSPORT_CHIP }}
          />
          <p className="intro-chip-question">Do you have a passport or ID with a chip?</p>
          <p className="intro-chip-hint">
            Look for this symbol on your passport or ID card. Your phone reads the chip over NFC.
          </p>
          <button type="button" className="flow-primary" disabled={!items} onClick={onContinue}>
            Continue
          </button>
          <p className="intro-privacy">Your ID data never leaves your device.</p>
        </div>
      </Main>
    </div>
  )
}

function Asks({ items, purpose }: { items: QueryDescriptionItem[]; purpose?: string }) {
  // Claims are about the holder and carry a tick; notes are facts about the
  // proof itself, so they sit with the purpose at the foot of the panel
  const claims = items.filter((item) => !item.note)
  const notes = items.filter((item) => item.note)

  return (
    <ul className="intro-list">
      {claims.map((item) => (
        <li key={item.title}>
          <span className="intro-tick" dangerouslySetInnerHTML={{ __html: ICON_CHECK }} />
          <span className="intro-ask">
            <span className="intro-ask-title">{item.title}</span>
            {item.detail ? <span className="intro-ask-detail">{item.detail}</span> : null}
          </span>
        </li>
      ))}
      {notes.map((item, index) => (
        <Note key={index} label={item.note!} item={item} />
      ))}
      {purpose ? <Note label="Purpose" item={{ title: purpose }} /> : null}
    </ul>
  )
}

function Note({ label, item }: { label: string; item: QueryDescriptionItem }) {
  return (
    <li className="intro-note">
      <span className="intro-note-label">{label}</span>
      {item.rows ? (
        <dl className="intro-note-rows">
          {item.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="intro-note-text">{item.title}</span>
      )}
      {item.detail ? <span className="intro-ask-detail">{item.detail}</span> : null}
    </li>
  )
}

// Same elements as a real row, so nothing reflows when the query resolves
export function AsksLoading() {
  return (
    <ul className="intro-list" role="status" aria-label="Loading request">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <li key={index}>
          <span className="intro-tick intro-tick-blank" />
          <span className="intro-ask">
            <span className="intro-ask-title intro-ask-loading">
              <span className="intro-bar" style={{ width: "80%" }} />
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
