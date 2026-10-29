import { describeQuery, type QueryDescriptionItem } from "@zkpassport/ui/hosted"
import type { Query } from "@zkpassport/sdk"
import type { CoverageCountryOption } from "@zkpassport/utils"

import { ICON_CHECK, ICON_EPASSPORT_CHIP } from "../shared/icons"
import { Main } from "../shared/controls"
import { canContinue, type Triage, type TriageDocumentType, type Verdict } from "./triage"

const SKELETON_ROWS = 2

const DOCUMENT_TYPES: { type: TriageDocumentType; label: string }[] = [
  { type: "passport", label: "Passport" },
  { type: "id_card", label: "ID card" },
  { type: "residence_permit", label: "Residence permit" },
]

// A preview: the mobile app shows the consent screen that actually binds
export function Intro({
  appName,
  query,
  purpose,
  countries,
  triage,
  verdict,
  onTriage,
  onContinue,
}: {
  appName: string
  query: Query | null
  purpose?: string
  countries: CoverageCountryOption[]
  triage: Triage
  verdict: Verdict
  onTriage: (triage: Triage) => void
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

        <TriageForm
          appName={appName}
          countries={countries}
          triage={triage}
          verdict={verdict}
          onTriage={onTriage}
        />

        <div className="intro-chip">
          <button
            type="button"
            className="flow-primary"
            disabled={!items || !canContinue(verdict)}
            onClick={onContinue}
          >
            Continue
          </button>
          <p className="intro-privacy">Your ID data never leaves your device.</p>
        </div>
      </Main>
    </div>
  )
}

/**
 * Which document the user will scan. The answer tells them now how it will be read, or that it
 * can't serve this request, and travels with the request so the app doesn't ask again.
 */
function TriageForm({
  appName,
  countries,
  triage,
  verdict,
  onTriage,
}: {
  appName: string
  countries: CoverageCountryOption[]
  triage: Triage
  verdict: Verdict
  onTriage: (triage: Triage) => void
}) {
  return (
    <div className="intro-triage">
      <p className="intro-triage-head">Which ID will you use?</p>
      <div className="triage-types" role="radiogroup" aria-label="Document type">
        {DOCUMENT_TYPES.map((option) => (
          <button
            key={option.type}
            type="button"
            role="radio"
            aria-checked={triage.documentType === option.type}
            className="triage-type"
            data-selected={triage.documentType === option.type ? "" : undefined}
            onClick={() => onTriage({ ...triage, documentType: option.type, issueYear: null })}
          >
            {option.label}
          </button>
        ))}
      </div>
      {triage.documentType === "passport" ? (
        <label className="triage-field">
          <span>Issuing country</span>
          <select
            value={triage.country ?? ""}
            onChange={(event) =>
              onTriage({ ...triage, country: event.target.value || null, issueYear: null })
            }
          >
            <option value="">Choose a country</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {verdict.kind === "ask_year" ? (
        <label className="triage-field">
          <span>Issued</span>
          <select
            value={triage.issueYear ?? ""}
            onChange={(event) =>
              onTriage({
                ...triage,
                issueYear: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">Choose when</option>
            {verdict.ranges.map((range, index) => (
              <option key={range.from} value={range.from}>
                {index === 0 && range.to !== undefined
                  ? `Before ${range.to + 1}`
                  : range.to === undefined
                    ? `${range.from} or later`
                    : `${range.from} to ${range.to}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <VerdictLine appName={appName} verdict={verdict} />
    </div>
  )
}

function VerdictLine({ appName, verdict }: { appName: string; verdict: Verdict }) {
  const chip = (
    <span
      className="intro-chip-mark"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_EPASSPORT_CHIP }}
    />
  )
  switch (verdict.kind) {
    case "chip":
      return (
        <p className="triage-verdict" data-tone="ok" role="status">
          {chip}
          This passport has a chip. The app reads it over NFC; hold your phone on the back cover.
        </p>
      )
    case "card":
      return (
        <p className="triage-verdict" data-tone="ok" role="status">
          {chip}
          The app reads the chip in your card over NFC. Look for this symbol on it.
        </p>
      )
    case "camera":
      return (
        <p className="triage-verdict" data-tone="ok" role="status">
          This passport has no chip the app can verify, so it reads the photo page with the camera
          and checks your face against it.
        </p>
      )
    case "ask_year":
      return (
        <p className="triage-verdict" role="status">
          Passports from this country changed over the years. The issue date is on the photo page.
        </p>
      )
    case "blocked":
      return (
        <p className="triage-verdict" data-tone="alert" role="alert">
          {verdict.reason === "chipless"
            ? `${appName} only accepts IDs read from their chip, and this passport doesn't have one. Choose another ID if you have one.`
            : verdict.reason === "chipUnverifiable"
              ? `${appName} only accepts IDs read from their chip, and the chip of this passport can't be verified yet. Choose another ID if you have one.`
              : verdict.reason === "unsupported"
                ? "This passport can't be used with ZKPassport yet. Choose another ID if you have one."
                : `${appName} doesn't accept the way this ID would be verified. Choose another ID if you have one.`}
        </p>
      )
    case "unknown":
      return (
        <p className="triage-verdict" role="status">
          Not sure? Continue, and the app will tell you when it sees your ID.
        </p>
      )
  }
}

function Asks({ items, purpose }: { items: QueryDescriptionItem[]; purpose?: string }) {
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
