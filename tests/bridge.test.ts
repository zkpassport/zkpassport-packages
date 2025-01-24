import { ZKPassport as ZkPassportVerifier } from "../src/index"
import { ZkPassportProver } from "../src/mobile"
import { MockWebSocket } from "./helpers/MockWebSocket"
import {
  simulateHelloFromFrontend,
  simulateHandshakeFromMobile,
  waitForCallback,
} from "./helpers/utils"
import { hexToBytes } from "@noble/ciphers/utils"

const topic = "abc456"
const keyPairFrontend = {
  privateKey: hexToBytes("aff05bedec7aaf1ae09628bf81ab50cb025587de29ef99d65ede2b9137a8e6fd"),
  publicKey: hexToBytes("02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4"),
}
const keyPairMobile = {
  privateKey: hexToBytes("5af6bf929ab3b5e2f5720804bec6e6f21e2bddc359d33b37aebd3bcdc55ed80e"),
  publicKey: hexToBytes("03ca2d5fb061bc822e1a45c598eddc08069c37fefe096047a90a7ff9cb7db488aa"),
}

let wsClient: MockWebSocket | null = null

jest.mock("../src/websocket", () => {
  return {
    getWebSocketClient: jest.fn((url: string, origin?: string) => {
      const wsClientInstance = new MockWebSocket(url, {
        headers: {
          Origin: origin || "nodejs",
        },
      })
      wsClient = wsClientInstance
      return wsClientInstance
    }),
  }
})

describe("Prover (mobile)", () => {
  let zkPassportProver: ZkPassportProver

  beforeEach(async () => {
    zkPassportProver = new ZkPassportProver()
  })

  test("should connect to websocket bridge", async () => {
    const scannedUrl = `https://zkpassport.id/r?d=localhost&t=${topic}&p=02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4`

    const {
      onDomainVerified,
      notifyAccept,
      notifyReject,
      notifyDone,
      onBridgeConnect,
      isBridgeConnected,
      isDomainVerified,
    } = await zkPassportProver.scan(scannedUrl, {
      keyPairOverride: keyPairMobile,
    })

    // Wait for the bridge to connect
    expect(isBridgeConnected()).toBe(false)
    await waitForCallback(onBridgeConnect)
    expect(isBridgeConnected()).toBe(true)

    // Wait for the domain to be verified
    expect(isDomainVerified()).toBe(false)
    await simulateHelloFromFrontend(wsClient!, keyPairFrontend, keyPairMobile, topic)
    await waitForCallback(onDomainVerified)
    expect(isDomainVerified()).toBe(true)
  })
})

describe("Verifier (frontend)", () => {
  let zkPassport: ZkPassportVerifier

  beforeEach(() => {
    zkPassport = new ZkPassportVerifier("localhost")
  })

  test("connect to websocket bridge", async () => {
    const queryBuilder = await zkPassport.request({
      name: "Test App",
      logo: "https://test.com/logo.png",
      purpose: "Testing connection",
      keyPairOverride: keyPairFrontend,
      topicOverride: topic,
    })

    const {
      url,
      requestId,
      onRequestReceived,
      onGeneratingProof,
      onProofGenerated,
      onResult,
      onBridgeConnect,
      isBridgeConnected,
    } = queryBuilder.done()

    expect(requestId).toBe(topic)

    // Wait for the bridge to connect
    expect(isBridgeConnected()).toBe(false)
    await waitForCallback(onBridgeConnect)
    expect(isBridgeConnected()).toBe(true)

    // Wait for the handshake
    await simulateHandshakeFromMobile(wsClient!, keyPairMobile.publicKey)
    await waitForCallback(onRequestReceived)
  })
})
