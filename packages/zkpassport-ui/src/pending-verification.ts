const STORAGE_KEY = "zkpassport:pending-verification"
// The note belongs to this tab, so it goes when the tab does. This only guards a tab left open for
// a long time after the user walked away.
const MAX_AGE_MS = 30 * 60 * 1000

/**
 * A verification this page started and has not seen the end of. The browser can discard the tab
 * while the user is in the app; this note is all a rebuilt page has to find the verification again.
 */
export type PendingVerification = { session: string; startedAt: number }

export function loadPendingVerification(): PendingVerification | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const pending = JSON.parse(raw) as PendingVerification
    if (Date.now() - pending.startedAt >= MAX_AGE_MS) {
      forgetPendingVerification()
      return null
    }
    return pending
  } catch {
    // Private mode or blocked site data: there is nothing to resume
    return null
  }
}

export function rememberPendingVerification(session: string): void {
  try {
    const pending: PendingVerification = { session, startedAt: Date.now() }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // Without storage the verification still runs, it just cannot be picked back up
  }
}

export function forgetPendingVerification(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to clean up if the store is unreachable
  }
}
