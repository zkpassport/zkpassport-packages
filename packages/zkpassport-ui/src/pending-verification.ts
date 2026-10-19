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
  startedAt: number
  phoneJoined: boolean
}

// Held per request, so starting one verification cannot drop another that is still running
type PendingStore = Record<string, PendingVerification>

export function loadPendingVerification(requestKey: string): PendingVerification | null {
  return read()[requestKey] ?? null
}

export function rememberPendingVerification(session: string, requestKey: string): void {
  const store = read()
  // Reopening the same verification must not extend how long it stays offered
  if (store[requestKey]?.session === session) return
  save({ ...store, [requestKey]: { session, startedAt: Date.now(), phoneJoined: false } })
}

/** The phone holds the request now, so the verification outlives the window that started it. */
export function markPhoneJoined(requestKey: string): void {
  const store = read()
  const pending = store[requestKey]
  if (!pending || pending.phoneJoined) return
  save({ ...store, [requestKey]: { ...pending, phoneJoined: true } })
}

export function forgetPendingVerification(requestKey: string): void {
  const store = read()
  delete store[requestKey]
  save(store)
}

// Expired entries are left out here, so the next write drops them for good
function read(): PendingStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const stored = JSON.parse(raw) as PendingStore
    const oldest = Date.now() - MAX_AGE_MS
    return Object.fromEntries(Object.entries(stored).filter(([, p]) => p.startedAt > oldest))
  } catch {
    // Private mode or blocked site data: there is nothing to resume
    return {}
  }
}

function save(store: PendingStore): void {
  try {
    if (Object.keys(store).length === 0) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Without storage the verification still runs, it just cannot be picked back up
  }
}
