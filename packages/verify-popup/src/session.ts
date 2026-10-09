import { bytesToHex, hexToBytes, type Hex } from "viem"
import type { KeyPair } from "@zkpassport/sdk"

import type { PopupConfigureMessage, PopupSuccess } from "@zkpassport/sdk/popup"

const STORAGE_PREFIX = "zkpassport:session:"
// Long enough for an App Store install and an ID scan, short enough that the bridge private key is
// not left lying around afterwards
const SESSION_MAX_AGE_MS = 30 * 60 * 1000

export type SessionConfiguration = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  credential: PopupConfigureMessage["credential"]
  // Browser-attested origin of the page that opened this popup
  rpOrigin: string
}

/** A result the popup produced, kept until the page that asked for it has taken it. */
export type HeldResult = Omit<PopupSuccess, "zkpassport">

export type SessionState = {
  createdAt: number
  configuration?: SessionConfiguration
  keyPair?: KeyPair
  /** How far the phone had got, so a reloaded page reopens on the screen the user left. */
  stage?: "scanned" | "proving"
  result?: HeldResult
}

export type Session = {
  id: string
  /** True when this page is picking up a verification that was already running. */
  resumed: boolean
}

type StoredSession = Omit<SessionState, "keyPair"> & {
  keyPair?: { privateKey: Hex; publicKey: Hex }
}

/**
 * The verification this page is for. The id travels in the page's own URL, because that is what the
 * browser rebuilds a discarded tab from; everything behind it lives in this origin's storage.
 */
export function openSession(): Session {
  sweepExpiredSessions()
  const fromUrl = new URLSearchParams(window.location.search).get("s")
  if (fromUrl) return { id: fromUrl, resumed: read(fromUrl) !== null }

  // Older callers open the popup without one, so it names itself
  const id = randomId()
  try {
    const url = new URL(window.location.href)
    url.searchParams.set("s", id)
    window.history.replaceState(null, "", url)
  } catch {
    // Without the id in the URL this page just cannot be recovered
  }
  return { id, resumed: false }
}

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function readSession(session: Session): SessionState | null {
  const stored = read(session.id)
  if (!stored) return null
  const { keyPair, ...rest } = stored
  return keyPair
    ? {
        ...rest,
        keyPair: {
          privateKey: hexToBytes(keyPair.privateKey),
          publicKey: hexToBytes(keyPair.publicKey),
        },
      }
    : rest
}

export function updateSession(session: Session, patch: Partial<SessionState>): void {
  const { keyPair, ...rest } = patch
  const next: StoredSession = { createdAt: Date.now(), ...read(session.id), ...rest }
  if (keyPair) {
    next.keyPair = {
      privateKey: bytesToHex(keyPair.privateKey),
      publicKey: bytesToHex(keyPair.publicKey),
    }
  }
  write(session.id, next)
}

function read(id: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + id)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    // Private mode or blocked site data: nothing to recover from
    return null
  }
}

function write(id: string, state: StoredSession): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(state))
  } catch (reason) {
    // Without storage the flow still runs, it just cannot survive a reload
    console.warn("[zkpassport] could not save the verification for recovery", reason)
  }
}

// Dropped on load rather than on a timer, so the bridge private key of a verification the user
// walked away from does not sit here indefinitely
function sweepExpiredSessions(): void {
  try {
    const expired: string[] = []
    for (let index = 0; index < window.localStorage.length; index++) {
      const key = window.localStorage.key(index)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      const { createdAt } = JSON.parse(window.localStorage.getItem(key)!) as StoredSession
      if (Date.now() - createdAt >= SESSION_MAX_AGE_MS) expired.push(key)
    }
    for (const key of expired) window.localStorage.removeItem(key)
  } catch {
    // Nothing to sweep if the store cannot be read
  }
}
