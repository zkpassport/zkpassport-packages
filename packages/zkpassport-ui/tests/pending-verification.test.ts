import { afterEach, expect, test } from "bun:test"
import { forgetPendingVerification } from "../src/pending-verification"

const STORAGE_KEY = "zkpassport:pending-verification"

function fakeLocalStorage() {
  const storage = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
  }
  return storage
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
})

test("forgetting one verification drops the ones that expired", () => {
  const storage = fakeLocalStorage()
  storage.set(STORAGE_KEY, JSON.stringify({ "request-a": { session: "a", startedAt: 0 } }))

  forgetPendingVerification("request-b")

  expect(storage.has(STORAGE_KEY)).toBe(false)
})
