import { afterEach, expect, test } from "bun:test"
import {
  clearSession,
  decideConfigure,
  finishSession,
  openSession,
  readSession,
  resumableKeyPair,
  updateSession,
  type HeldResult,
  type Session,
  type SessionConfiguration,
} from "../src/session"

// A randomized conformance check for the property the TLA+ model proves: a verification's result
// reaches only an origin the user consented to when scanning. It drives the real session functions
// (openSession/updateSession/finishSession/resumableKeyPair/decideConfigure) through random
// histories of the browser events the popup sees, modelling only the boundary the code cannot
// reach itself: localStorage, which origin the opener tab currently shows, postMessage delivery,
// and which bridge the phone is on.

const PREFIX = "zkpassport:session:"
const SESSION_ID = "sess-1"
const MERCHANT = "https://merchant.test"
const OTHER = "https://other.test"
const MAX_AGE_MS = 30 * 60 * 1000

const RESULT = {
  type: "success",
  proofs: [{ name: "compare_age" }],
  result: { age: true },
} as unknown as HeldResult

// A bridge's identity rides in the first byte of its key, so a resumed key names the bridge rejoined
const keyPairForBridge = (bridge: number) => ({
  privateKey: Uint8Array.from([bridge, 0, 0, 1]),
  publicKey: Uint8Array.from([bridge, 0, 0, 2]),
})

function setupWindow(): Map<string, string> {
  const store = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = {
    location: { href: `https://verify.test/?s=${SESSION_ID}`, search: `?s=${SESSION_ID}` },
    history: { replaceState: () => {} },
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

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
})

type Op =
  | { t: "configure"; origin: string }
  | { t: "startRequest" }
  | { t: "scan" }
  | { t: "progress" }
  | { t: "result" }
  | { t: "reload" }
  | { t: "navigate" }
  | { t: "expire" }
  | { t: "sweep" }

type Violation = { at: number; delivered: string; consented: string[] }

function run(ops: Op[]): Violation | null {
  const store = setupWindow()
  let session: Session = openSession()
  let pageConfig: SessionConfiguration | null = null
  let pageHeld = false
  let requestLive = false
  let pageBridge: number | null = null
  let phoneBridge: number | null = null
  let resultSent = false
  let nextBridge = 1
  let openerDoc = MERCHANT
  const consented = new Set<string>()
  const delivered = new Set<string>()

  const owner = () => pageConfig?.rpOrigin
  // A postMessage reaches the opener tab only when that tab currently shows the target origin
  const deliver = (target: string) => {
    if (openerDoc === target) delivered.add(target)
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    switch (op.t) {
      case "configure": {
        const known = readSession(session)
        const decision = decideConfigure(session, known, {
          origin: op.origin,
          request: { name: "x" } as SessionConfiguration["request"],
          query: {} as SessionConfiguration["query"],
          credential: undefined,
        })
        if (decision.accepted) {
          if (!known?.configuration)
            updateSession(session, { configuration: decision.configuration })
          if (pageConfig === null) pageConfig = decision.configuration
          if (decision.handOver) {
            deliver(decision.configuration.rpOrigin)
            clearSession(session)
          }
        }
        break
      }
      case "startRequest": {
        if (pageConfig && !pageHeld && !requestLive) {
          requestLive = true
          const resumed = resumableKeyPair(session, owner())
          if (resumed) {
            pageBridge = resumed.privateKey[0]
          } else {
            pageBridge = nextBridge++
            updateSession(session, { keyPair: keyPairForBridge(pageBridge) }, owner())
          }
        }
        break
      }
      case "scan": {
        if (pageConfig && requestLive && !pageHeld && pageBridge !== null) {
          consented.add(pageConfig.rpOrigin)
          phoneBridge = pageBridge
        }
        break
      }
      case "progress": {
        if (pageConfig && phoneBridge !== null && pageBridge === phoneBridge) {
          updateSession(session, { stage: "proving" }, owner())
        }
        break
      }
      case "result": {
        if (pageConfig && phoneBridge !== null && pageBridge === phoneBridge && !resultSent) {
          finishSession(session, RESULT, owner())
          deliver(pageConfig.rpOrigin)
          resultSent = true
        }
        break
      }
      case "reload": {
        session = openSession()
        const restored = readSession(session)
        pageConfig = restored?.configuration ?? null
        pageHeld = !!restored?.result
        requestLive = false
        pageBridge = null
        break
      }
      case "navigate": {
        openerDoc = openerDoc === MERCHANT ? OTHER : MERCHANT
        break
      }
      case "expire": {
        const raw = store.get(PREFIX + session.id)
        if (raw) {
          const record = JSON.parse(raw)
          record.createdAt = Date.now() - MAX_AGE_MS - 60_000
          store.set(PREFIX + session.id, JSON.stringify(record))
        }
        break
      }
      case "sweep": {
        openSession()
        break
      }
    }

    for (const site of delivered) {
      if (!consented.has(site)) return { at: i, delivered: site, consented: [...consented] }
    }
  }
  return null
}

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KINDS: Op["t"][] = [
  "configure",
  "configure",
  "startRequest",
  "scan",
  "progress",
  "result",
  "reload",
  "navigate",
  "expire",
  "sweep",
]

function generate(rng: () => number, length: number): Op[] {
  const ops: Op[] = []
  for (let i = 0; i < length; i++) {
    const kind = KINDS[Math.floor(rng() * KINDS.length)]
    ops.push(
      kind === "configure"
        ? { t: "configure", origin: rng() < 0.5 ? MERCHANT : OTHER }
        : { t: kind },
    )
  }
  return ops
}

// Greedily drop operations while the history still violates, to report a minimal counterexample
function shrink(ops: Op[], at: number): Op[] {
  let best = ops.slice(0, at + 1)
  for (let improved = true; improved;) {
    improved = false
    for (let i = 0; i < best.length; i++) {
      const candidate = [...best.slice(0, i), ...best.slice(i + 1)]
      if (run(candidate)) {
        best = candidate
        improved = true
        break
      }
    }
  }
  return best
}

const show = (ops: Op[]) =>
  ops
    .map((op) =>
      op.t === "configure" ? `configure(${op.origin === MERCHANT ? "merchant" : "other"})` : op.t,
    )
    .join(" → ")

test("a verification's result reaches only a consented origin, over random histories", () => {
  const RUNS = 3000
  for (let seed = 1; seed <= RUNS; seed++) {
    const rng = mulberry32(seed)
    const ops = generate(rng, 6 + Math.floor(rng() * 18))
    const violation = run(ops)
    if (violation) {
      const minimal = shrink(ops, violation.at)
      throw new Error(
        `Result leaked to ${violation.delivered} (consented: ${JSON.stringify(violation.consented)}).\n` +
          `Seed ${seed}. Minimal history:\n  ${show(minimal)}`,
      )
    }
  }
  expect(true).toBe(true)
})
