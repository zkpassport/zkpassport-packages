import { afterEach, describe, expect, test } from "bun:test"
import {
  finishSession,
  openSession,
  readSession,
  updateSession,
  type Session,
} from "../src/session"

const ORIGIN = "https://verify.zkpassport.id"
const PREFIX = "zkpassport:session:"

type Store = Map<string, string>

function setupWindow(search = ""): Store {
  const store: Store = new Map()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = {
    location: { href: `${ORIGIN}/${search}`, search },
    history: {
      replaceState: (_state: unknown, _title: string, url: URL | string) => {
        const next = new URL(String(url))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(globalThis as any).window.location = { href: next.href, search: next.search }
      },
    },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    },
  }
  return store
}

function brokenStorage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window.localStorage = {
    getItem: () => {
      throw new Error("The operation is insecure.")
    },
    setItem: () => {
      throw new Error("The quota has been exceeded.")
    },
    removeItem: () => {
      throw new Error("The operation is insecure.")
    },
    key: () => {
      throw new Error("The operation is insecure.")
    },
    get length(): number {
      throw new Error("The operation is insecure.")
    },
  }
}

function store(id: string, state: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window.localStorage.setItem(PREFIX + id, JSON.stringify(state))
}

const CONFIGURATION = {
  request: { name: "Example" },
  query: { age: { gte: 18 } },
  credential: undefined,
  rpOrigin: "https://merchant.example",
} as const

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
})

describe("openSession", () => {
  test("takes the verification from the page's own URL", () => {
    setupWindow("?s=abc-123")

    expect(openSession()).toEqual({ id: "abc-123", resumed: false })
  })

  test("reports a resumed session when the id already has a record", () => {
    setupWindow("?s=abc-123")
    store("abc-123", { createdAt: Date.now(), configuration: CONFIGURATION })

    expect(openSession()).toEqual({ id: "abc-123", resumed: true })
  })

  test("names itself and puts the name in the URL when the opener sent none", () => {
    setupWindow()

    const session = openSession()

    expect(session.resumed).toBe(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(new URL((globalThis as any).window.location.href).searchParams.get("s")).toBe(session.id)
  })

  test("drops records too old to still be running, including other verifications'", () => {
    const stored = setupWindow("?s=abc-123")
    const expired = Date.now() - 31 * 60 * 1000
    store("abc-123", { createdAt: expired, configuration: CONFIGURATION })
    store("abandoned", { createdAt: expired, configuration: CONFIGURATION })
    store("live", { createdAt: Date.now(), configuration: CONFIGURATION })

    expect(openSession()).toEqual({ id: "abc-123", resumed: false })
    expect(stored.has(PREFIX + "abc-123")).toBe(false)
    expect(stored.has(PREFIX + "abandoned")).toBe(false)
    expect(stored.has(PREFIX + "live")).toBe(true)
  })

  test("drops a record it cannot read rather than giving up on the rest", () => {
    const stored = setupWindow("?s=abc-123")
    stored.set(PREFIX + "unreadable", "{ not json")
    store("live", { createdAt: Date.now(), configuration: CONFIGURATION })
    store("abandoned", { createdAt: Date.now() - 31 * 60 * 1000, configuration: CONFIGURATION })

    openSession()

    expect(stored.has(PREFIX + "unreadable")).toBe(false)
    expect(stored.has(PREFIX + "abandoned")).toBe(false)
    expect(stored.has(PREFIX + "live")).toBe(true)
  })
})

describe("readSession and updateSession", () => {
  const session: Session = { id: "abc-123", resumed: false }

  test("gives the keypair back as the bytes the SDK takes", () => {
    setupWindow("?s=abc-123")
    const keyPair = {
      privateKey: Uint8Array.from([1, 2, 3, 250]),
      publicKey: Uint8Array.from([4, 5, 6, 255]),
    }

    updateSession(session, { keyPair })

    expect(readSession(session)?.keyPair).toEqual(keyPair)
  })

  test("keeps what earlier writes recorded", () => {
    setupWindow("?s=abc-123")

    updateSession(session, { configuration: CONFIGURATION })
    updateSession(session, {
      keyPair: { privateKey: Uint8Array.from([1]), publicKey: Uint8Array.from([2]) },
    })
    updateSession(session, { result: { type: "success", proofs: [], result: {} } as never })

    const state = readSession(session)
    expect(state?.configuration).toEqual(CONFIGURATION)
    expect(state?.keyPair?.privateKey).toEqual(Uint8Array.from([1]))
    expect(state?.result?.type).toBe("success")
  })
})

describe("finishSession", () => {
  test("keeps the result to hand over and drops the bridge key", () => {
    setupWindow("?s=abc-123")
    const session: Session = { id: "abc-123", resumed: false }
    updateSession(session, {
      configuration: CONFIGURATION,
      keyPair: { privateKey: Uint8Array.from([1]), publicKey: Uint8Array.from([2]) },
    })

    finishSession(session, { type: "success", proofs: [], result: {} } as never)

    const state = readSession(session)
    expect(state?.keyPair).toBeUndefined()
    expect(state?.result?.type).toBe("success")
    expect(state?.configuration).toEqual(CONFIGURATION)
  })
})

describe("storage the browser refuses", () => {
  test("leaves the verification runnable, just not recoverable", () => {
    setupWindow("?s=abc-123")
    brokenStorage()

    expect(openSession()).toEqual({ id: "abc-123", resumed: false })
    expect(() => updateSession({ id: "abc-123", resumed: false }, {})).not.toThrow()
    expect(readSession({ id: "abc-123", resumed: false })).toBeNull()
  })
})
