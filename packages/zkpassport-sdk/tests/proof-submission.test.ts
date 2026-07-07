/* eslint-disable @typescript-eslint/no-explicit-any */
import { ZKPassport } from "../src/index"
import { MockWebSocket } from "./helpers/mock-websocket"

describe("Proof submission", () => {
  let originalFetch: typeof globalThis.fetch
  let fetchedUrls: string[]
  let fetchedBodies: string[]

  function mockFetch() {
    fetchedUrls = []
    fetchedBodies = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchedUrls.push(typeof input === "string" ? input : input.toString())
      if (init?.body) fetchedBodies.push(init.body as string)
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as unknown as typeof globalThis.fetch
  }

  // Seed the private state that handleResult reads, and override verify()
  // so the test does not need to drag in bb.js / the proof registry.
  function primeForHandleResult(
    zk: ZKPassport,
    opts: {
      topic?: string
      verifyResult: {
        verified: boolean
        uniqueIdentifier?: string
        uniqueIdentifierType?: number
      }
      failedProofs?: number
    },
  ) {
    const topic = opts.topic ?? "topic-1"
    const proof = {
      proof: "0xdeadbeef",
      vkeyHash: "0x1",
      version: "v0",
      name: "outer_xyz",
      index: 0,
      total: 1,
      committedInputs: "0x0",
    }
    const i = zk as any
    i.topicToProofs[topic] = [proof]
    i.topicToResults[topic] = { age: { gte: 18 } }
    i.topicToConfig[topic] = { age: { gte: 18 } }
    i.topicToLocalConfig[topic] = { validity: 0, devMode: false, oprfKeyId: null }
    i.topicToService[topic] = { name: "n", logo: "l", purpose: "p", scope: "test-scope" }
    i.topicToPublicKey[topic] = "04deadbeefpubkey"
    i.topicToFailedProofCount[topic] = opts.failedProofs ?? 0
    i.onResultCallbacks[topic] = []
    i.verify = async () => opts.verifyResult
    return { topic, proof }
  }

  beforeEach(() => {
    MockWebSocket.clearHub()
    originalFetch = globalThis.fetch
    mockFetch()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("submits proof to the dashboard API when verification succeeds", async () => {
    const zk = new ZKPassport("localhost")
    const { topic } = primeForHandleResult(zk, {
      verifyResult: { verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 },
    })

    await (zk as any).handleResult(topic)

    expect(fetchedUrls).toEqual(["https://dashboard-api.zkpassport.id/public/proofs"])
    const body = JSON.parse(fetchedBodies[0])
    expect(body).toMatchObject({
      domain: "localhost",
      scope: "test-scope",
      query: { age: { gte: 18 } },
      // The bridge public key (URL `p=`), not the topic — links the proof to its activity row.
      requestId: "04deadbeefpubkey",
    })
    expect(body.uniqueIdentifier).toBeUndefined()
    expect(body.proofs).toHaveLength(1)
    expect(body.proofs[0]).toMatchObject({ proof: "0xdeadbeef", name: "outer_xyz" })
  })

  test("omits requestId when the bridge public key is unavailable", async () => {
    const zk = new ZKPassport("localhost")
    const { topic } = primeForHandleResult(zk, {
      verifyResult: { verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 },
    })
    delete (zk as any).topicToPublicKey[topic]

    await (zk as any).handleResult(topic)

    const body = JSON.parse(fetchedBodies[0])
    expect("requestId" in body).toBe(false)
  })

  test("does not submit when disableProofStorage is true", async () => {
    const zk = new ZKPassport("localhost", { disableProofStorage: true })
    const { topic } = primeForHandleResult(zk, {
      verifyResult: { verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 },
    })

    await (zk as any).handleResult(topic)

    expect(fetchedUrls).toEqual([])
  })

  test("does not submit when devMode is enabled", async () => {
    const zk = new ZKPassport("localhost")
    const { topic } = primeForHandleResult(zk, {
      verifyResult: { verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 },
    })
    ;(zk as any).topicToLocalConfig[topic].devMode = true

    await (zk as any).handleResult(topic)

    expect(fetchedUrls).toEqual([])
  })

  test("does not submit when any proof failed to generate, even if verify() reports success", async () => {
    const zk = new ZKPassport("localhost")
    const { topic } = primeForHandleResult(zk, {
      verifyResult: { verified: true, uniqueIdentifier: "uid-1", uniqueIdentifierType: 0 },
      failedProofs: 1,
    })

    await (zk as any).handleResult(topic)

    expect(fetchedUrls).toEqual([])
  })
})
