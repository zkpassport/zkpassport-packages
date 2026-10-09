const STORAGE_KEY = "zkpassport:pending-verification"
// Long enough for an App Store install and an ID scan. A button offering to continue a verification
// that died long ago is worse than no button.
const MAX_AGE_MS = 30 * 60 * 1000

/**
 * A verification this page started and has not seen the end of. The browser can discard the tab
 * while the user is in the app; this note is all a rebuilt page has to find the verification again.
 */
export type PendingVerification = {
  session: string
  /** What it asks for, so a button asking for something else does not offer to continue it. */
  requestKey: string
  startedAt: number
  phoneJoined: boolean
}

export function loadPendingVerification(requestKey: string): PendingVerification | null {
  const pending = read()
  if (!pending) return null
  if (Date.now() - pending.startedAt >= MAX_AGE_MS) {
    forgetPendingVerification()
    return null
  }
  return pending.requestKey === requestKey ? pending : null
}

export function rememberPendingVerification(session: string, requestKey: string): void {
  // Reopening the same verification must not extend how long it stays offered
  if (read()?.session === session) return
  save({ session, requestKey, startedAt: Date.now(), phoneJoined: false })
}

/** The phone holds the request now, so the verification outlives the window that started it. */
export function markPhoneJoined(): void {
  const pending = read()
  if (!pending || pending.phoneJoined) return
  save({ ...pending, phoneJoined: true })
}

export function forgetPendingVerification(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean up if the store is unreachable
  }
}

function read(): PendingVerification | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PendingVerification) : null
  } catch {
    // Private mode or blocked site data: there is nothing to resume
    return null
  }
}

function save(pending: PendingVerification): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // Without storage the verification still runs, it just cannot be picked back up
  }
}
