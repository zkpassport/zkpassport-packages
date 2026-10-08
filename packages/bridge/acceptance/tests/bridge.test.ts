import { describe, test, expect, mock, setDefaultTimeout } from "bun:test"
import { bytesToHex, hexToBytes } from "@noble/ciphers/utils"
import { getSharedSecret } from "../src/encryption"
import { Bridge, CreateOptions, JoinOptions } from "../src"
import { mockWebSocket, waitForCallback, delay } from "./helpers"

// Enable debug logging for tests
import debug from "debug"
debug.enable("bridge:*")

// Set default timeout for all tests to 10 seconds
setDefaultTimeout(10000)

// Default options for creating and joining a bridge
const CREATE_OPTIONS: CreateOptions = { bridgeUrl: "wss://bridge-staging.zkpassport.id" }
const JOIN_OPTIONS: JoinOptions = { bridgeUrl: "wss://bridge-staging.zkpassport.id" }

// Mock the websocket module. Set USE_REAL_BRIDGE_SERVER=1 to test against a real bridge server
if (!process.env.USE_REAL_BRIDGE_SERVER) mock.module("../src/websocket", mockWebSocket)

// This is the fixed keypair for test consistency
const keyPairFrontend = {
  privateKey: hexToBytes("aff05bedec7aaf1ae09628bf81ab50cb025587de29ef99d65ede2b9137a8e6fd"),
  publicKey: hexToBytes("02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4"),
}
const keyPairMobile = {
  privateKey: hexToBytes("5af6bf929ab3b5e2f5720804bec6e6f21e2bddc359d33b37aebd3bcdc55ed80e"),
  publicKey: hexToBytes("03ca2d5fb061bc822e1a45c598eddc08069c37fefe096047a90a7ff9cb7db488aa"),
}

describe("Bridge", () => {
  test("should connect to bridge and establish secure channel", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    // Set up listener early to avoid race conditions
    const onCreatorSecureChannelEstablished = waitForCallback(creator.onSecureChannelEstablished)

    await waitForCallback(creator.onConnect)
    expect(creator.isBridgeConnected()).toBe(true)

    await using joiner = await Bridge.join(creator.connectionString, JOIN_OPTIONS)
    // Set up listener early to avoid race conditions
    const onJoinerSecureChannelEstablished = waitForCallback(joiner.onSecureChannelEstablished)

    await waitForCallback(joiner.onConnect)
    expect(joiner.isBridgeConnected()).toBe(true)

    await onCreatorSecureChannelEstablished
    expect(creator.isSecureChannelEstablished()).toBe(true)

    await onJoinerSecureChannelEstablished
    expect(joiner.isSecureChannelEstablished()).toBe(true)
  })

  test("should use custom keypairs", async () => {
    await using creator = await Bridge.create({ ...CREATE_OPTIONS, keyPair: keyPairFrontend })
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, keyPair: keyPairMobile })
    await waitForCallback(joiner.onSecureChannelEstablished)

    expect(creator.connectionString).toStartWith(
      "obsidion:02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4"
    )
    expect(joiner.connectionString).toStartWith(
      "obsidion:02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4"
    )
    const sharedSecret = await getSharedSecret(keyPairFrontend.privateKey, keyPairMobile.publicKey)
    expect(bytesToHex(sharedSecret)).toBe("02bc79c530fe88c0473087e4e31f8a186704c1ddedd9cc450a00f4f3582364c1")
  }) // creator.close() and joiner.close() are automatically called here!

  test("should use custom origin", async () => {
    await using creator = await Bridge.create({ ...CREATE_OPTIONS, origin: "https://localhost" })
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, JOIN_OPTIONS)
    await waitForCallback(joiner.onSecureChannelEstablished)

    expect(creator.origin).toBe("https://localhost")
    expect(creator.connectionString).toContain("d=https://localhost")
    expect(joiner.origin).toBe("https://localhost")
    expect(joiner.connectionString).toContain("d=https://localhost")
  })

  test("should fail to verify incorrect origin", async () => {
    await using creator = await Bridge.create({ ...CREATE_OPTIONS, origin: "https://actual-origin.com" })
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(
      creator.connectionString.replace("actual-origin.com", "wrong-origin.com"),
      JOIN_OPTIONS
    )

    expect(creator.connectionString).toContain("d=https://actual-origin.com")
    expect(creator.origin).toBe("https://actual-origin.com")
    expect(joiner.origin).toBe("https://wrong-origin.com")

    const error = await waitForCallback(joiner.onError)
    expect(error).toContain("origin")
  })

  test("should send messages over bridge", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    // Set up listener early to avoid race conditions
    const onCreatorSecureChannelEstablished = waitForCallback(creator.onSecureChannelEstablished)
    // Wait for creator to connect first to avoid race conditions
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, originOnConnect: false })

    // Wait for both secure channels to be established to avoid race conditions
    await waitForCallback(joiner.onSecureChannelEstablished)
    await onCreatorSecureChannelEstablished

    // Set up listeners for messages before sending any messages
    const creatorOnMessage = waitForCallback(creator.onSecureMessage)
    const joinerOnMessage = waitForCallback(joiner.onSecureMessage)

    creator.sendMessage("hello, world?", {})
    const message1 = await joinerOnMessage
    expect(message1).toEqual({ method: "hello, world?", params: {} })

    joiner.sendMessage("hello, world!", {})
    const message2 = await creatorOnMessage
    expect(message2).toEqual({ method: "hello, world!", params: {} })
  })

  test("should handle reconnect on disconnect", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    const onCreatorSecureChannelEstablished = waitForCallback(creator.onSecureChannelEstablished)
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, JOIN_OPTIONS)
    await waitForCallback(joiner.onSecureChannelEstablished)
    await onCreatorSecureChannelEstablished

    expect(joiner.isBridgeConnected()).toBe(true)
    joiner.websocket!.close()
    expect(joiner.isBridgeConnected()).toBe(false)

    await waitForCallback(joiner.onConnect)
    expect(joiner.isBridgeConnected()).toBe(true)

    const creatorOnMessage = waitForCallback(creator.onSecureMessage)
    joiner.sendMessage("after reconnect", {})
    const message = await creatorOnMessage
    expect(message).toEqual({ method: "after reconnect", params: {} })
  })

  test("should correctly set config options", async () => {
    await using creator1 = await Bridge.create(CREATE_OPTIONS)
    // @ts-expect-error private property
    expect(creator1.connection.reconnect).toBe(true)
    expect(creator1.connection.keepalive).toBe(true)
    expect(creator1.websocket?.readyState).toBe(WebSocket.CONNECTING)

    await using creator2 = await Bridge.create({
      ...CREATE_OPTIONS,
      autoconnect: false,
      reconnect: false,
      keepalive: false,
    })
    // @ts-expect-error private property
    expect(creator2.connection.reconnect).toBe(false)
    expect(creator2.connection.keepalive).toBe(false)
    expect(creator2.websocket?.readyState).not.toBe(WebSocket.CONNECTING)

    await using joiner1 = await Bridge.join(creator1.connectionString, JOIN_OPTIONS)
    // @ts-expect-error private property
    expect(joiner1.connection.reconnect).toBe(true)
    expect(joiner1.connection.keepalive).toBe(true)

    await using joiner2 = await Bridge.join(creator2.connectionString, {
      ...JOIN_OPTIONS,
      reconnect: false,
      keepalive: false,
    })
    // @ts-expect-error private property
    expect(joiner2.connection.reconnect).toBe(false)
    expect(joiner2.connection.keepalive).toBe(false)
  })

  test("should correctly resume as joiner", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, JOIN_OPTIONS)
    await waitForCallback(joiner.onSecureChannelEstablished)

    // Create a new joiner resuming the session
    await using resumedJoiner = await Bridge.join(creator.connectionString, {
      ...JOIN_OPTIONS,
      resume: true,
      keyPair: joiner.getKeyPair(),
    })
    await waitForCallback(resumedJoiner.onSecureChannelEstablished)

    // Verify message exchange after resuming
    const creatorOnMessage = waitForCallback(creator.onSecureMessage)
    resumedJoiner.sendMessage("resumed joiner", {})
    const message = await creatorOnMessage
    expect(message).toEqual({ method: "resumed joiner", params: {} })
  })

  test("should correctly resume as creator", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    const creatorOnSecureChannelEstablished = waitForCallback(creator.onSecureChannelEstablished)
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, originOnConnect: false })
    await creatorOnSecureChannelEstablished
    await waitForCallback(joiner.onSecureChannelEstablished)
    expect(joiner.isSecureChannelEstablished()).toBe(true)

    // Create a new creator resuming the session
    await using resumedCreator = await Bridge.create({
      ...CREATE_OPTIONS,
      resume: true,
      keyPair: creator.getKeyPair(),
      remotePublicKey: hexToBytes(creator.getRemotePublicKey()),
    })
    await waitForCallback(resumedCreator.onSecureChannelEstablished)
    expect(resumedCreator.isSecureChannelEstablished()).toBe(true)

    // Verify message exchange after resuming
    const joinerOnMessage = waitForCallback(joiner.onSecureMessage)
    resumedCreator.sendMessage("resumed creator", {})
    const message = await joinerOnMessage
    expect(message).toEqual({ method: "resumed creator", params: {} })
  })

  test("payload size", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    // Set up listener early to avoid race conditions
    const onCreatorSecureChannelEstablished = waitForCallback(creator.onSecureChannelEstablished)
    // Wait for creator to connect first to avoid race conditions
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, originOnConnect: false })

    // Wait for both secure channels to be established to avoid race conditions
    await waitForCallback(joiner.onSecureChannelEstablished)
    await onCreatorSecureChannelEstablished

    // Set up listener for messages before sending any messages
    const creatorOnMessage = waitForCallback(creator.onSecureMessage)
    const joinerOnMessage = waitForCallback(joiner.onSecureMessage)

    // Try payload under max chunk size
    let payloadSize = 128
    let payload = ""
    while (JSON.stringify({ data: payload }).length < payloadSize) {
      payload += Math.random().toString(36).substring(2, 15)
    }
    await creator.sendMessage("small_payload", { payload })
    const message1 = await joinerOnMessage
    expect(message1).toEqual({ method: "small_payload", params: { payload } })

    // Try payload over max chunk size
    payloadSize = 1024 * 256
    payload = ""
    while (JSON.stringify({ data: payload }).length < payloadSize) {
      payload += Math.random().toString(36).substring(2, 15)
    }
    joiner.sendMessage("big_payload", { payload })
    const message2 = await creatorOnMessage
    expect(message2).toEqual({ method: "big_payload", params: { payload } })
  }, 20000)

  test("should ignore duplicate message ids", async () => {
    await using creator = await Bridge.create(CREATE_OPTIONS)
    const onCreatorSecureChannelEstablished = waitForCallback(creator.onSecureChannelEstablished)
    await waitForCallback(creator.onConnect)

    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, originOnConnect: false })
    await waitForCallback(joiner.onSecureChannelEstablished)
    await onCreatorSecureChannelEstablished
    // Get the handshake message id so we can ignore it later
    // @ts-expect-error private property
    const handshakeMessageId = Array.from(creator.connection.seenMessageIds)[0]

    // Send a message
    const joinerOnMessage = waitForCallback(joiner.onSecureMessage)
    await creator.sendMessage("hello, world!", { foo: "bar" })
    const message = await joinerOnMessage

    // Get the message id so we can send a duplicate
    // @ts-expect-error private property
    const duplicateId = Array.from(creator.connection.seenMessageIds).find((id) => id !== handshakeMessageId)
    expect(message).toEqual({ method: "hello, world!", params: { foo: "bar" } })
    // @ts-expect-error private property
    expect(joiner.connection.validMessagesReceived).toBe(2)

    // Manually send a message with a duplicate id
    const duplicateMessage = JSON.stringify({
      jsonrpc: "2.0",
      id: duplicateId,
      method: "foobar",
      params: { foo: "bar" },
    })
    creator.websocket!.send(duplicateMessage)

    // Wait to ensure the message would have been processed if it wasn't ignored
    // TODO: Improve the design of this test to avoid the delay
    await delay(1000)
    // The duplicate message should have been ignored, so validMessagesReceived should still be 2
    // @ts-expect-error private property
    expect(joiner.connection.validMessagesReceived).toBe(2)
  })

  test("should receive origin on connect (ooc)", async () => {
    const testOrigin = "https://test-ooc-origin.example.com"

    await using creator = await Bridge.create({ ...CREATE_OPTIONS, origin: testOrigin })
    await waitForCallback(creator.onConnect)

    // The creator's origin should be set
    expect(creator.origin).toBe(testOrigin)

    await using joiner = await Bridge.join(creator.connectionString, JOIN_OPTIONS)
    await waitForCallback(joiner.onSecureChannelEstablished)

    // The joiner should receive the origin via ooc and have it set
    expect(joiner.origin).toBe(testOrigin)
    // Verify that the origin was validated via ooc (not just from handshake)
    // @ts-expect-error private property
    expect(joiner.connection._originValidatedViaOoc).toBe(true)
  })

  test("should fail to verify incorrect origin on connect (ooc)", async () => {
    const actualOrigin = "https://actual-ooc-origin.com"
    const wrongOrigin = "https://wrong-ooc-origin.com"

    await using creator = await Bridge.create({ ...CREATE_OPTIONS, origin: actualOrigin })
    await waitForCallback(creator.onConnect)

    // Modify the connection string to have the wrong expected origin
    const tamperedConnectionString = creator.connectionString.replace(actualOrigin, wrongOrigin)

    await using joiner = await Bridge.join(tamperedConnectionString, JOIN_OPTIONS)

    // The joiner should receive an error because the ooc origin doesn't match
    const error = await waitForCallback(joiner.onError)
    expect(error).toContain("origin")
    expect(error).toContain(actualOrigin)
    expect(error).toContain(wrongOrigin)
  })

  test("should ignore unsolicited ooc messages", async () => {
    const { BridgeConnection } = await import("../src/bridge-connection")
    const connection = new BridgeConnection({
      role: "joiner",
      bridgeId: "test-bridge",
      keyPair: keyPairMobile,
      bridgeUrl: CREATE_OPTIONS.bridgeUrl,
      originOnConnect: false,
    })

    // Set up listener before connecting
    const onConnectPromise = new Promise<void>((resolve) => {
      connection.onConnect(() => resolve())
    })

    // Connect without requesting ooc by manually constructing a URL
    const urlWithoutOoc = `${CREATE_OPTIONS.bridgeUrl}?id=test-bridge&v=1`
    await connection.connect(urlWithoutOoc)
    await onConnectPromise

    // Manually send an unsolicited ooc message (from bridge server to joiner)
    const unsolicitedOocMessage = JSON.stringify({
      jsonrpc: "2.0",
      method: "ooc",
      params: { origin: "https://malicious-origin.com" },
    })
    const websocket = connection.getWebSocket()
    if (websocket?.onmessage) {
      // @ts-expect-error - calling onmessage directly for testing
      websocket.onmessage({ data: unsolicitedOocMessage })
    }

    // Wait a bit to ensure the message would have been processed
    await delay(10)

    // The bridge origin should not have been set from the unsolicited message
    // @ts-expect-error accessing private property
    expect(connection._bridgeOrigin).toBeUndefined()

    connection.cleanup()
  })

  test("should use ooc from connection string (joiner) when originOnConnect is not specified", async () => {
    // Creator with originOnConnect=false
    await using creator = await Bridge.create({ ...CREATE_OPTIONS, originOnConnect: false })
    await waitForCallback(creator.onConnect)

    // Connection string should not include ooc
    expect(creator.connectionString).not.toContain("ooc")

    // Joiner without specifying originOnConnect should use value from connection string (false)
    await using joiner = await Bridge.join(creator.connectionString, JOIN_OPTIONS)
    await waitForCallback(joiner.onConnect)

    // Joiner should not have ooc parameter since connection string didn't have it
    const joinerWebsocketUrl = joiner.websocket?.url || ""
    expect(joinerWebsocketUrl).not.toContain("ooc")
  })

  test("should allow joiner to override ooc from connection string (override false->true)", async () => {
    // Creator with originOnConnect=false
    await using creator = await Bridge.create({ ...CREATE_OPTIONS, originOnConnect: false })
    await waitForCallback(creator.onConnect)

    // Connection string should not include ooc
    expect(creator.connectionString).not.toContain("ooc")

    // Joiner explicitly sets originOnConnect=true, overriding the connection string
    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, originOnConnect: true })
    await waitForCallback(joiner.onConnect)

    // Joiner should have ooc parameter since it explicitly set to true
    const joinerWebsocketUrl = joiner.websocket?.url || ""
    expect(joinerWebsocketUrl).toContain("ooc")
  })

  test("should allow joiner to override ooc from connection string (override true->false)", async () => {
    // Creator with originOnConnect=true
    await using creator = await Bridge.create({ ...CREATE_OPTIONS, originOnConnect: true })
    await waitForCallback(creator.onConnect)

    // Connection string should include ooc
    expect(creator.connectionString).toContain("ooc")

    // Joiner explicitly sets originOnConnect=false, overriding the connection string
    await using joiner = await Bridge.join(creator.connectionString, { ...JOIN_OPTIONS, originOnConnect: false })
    await waitForCallback(joiner.onConnect)

    // Joiner should NOT have ooc parameter since it explicitly set to false
    const joinerWebsocketUrl = joiner.websocket?.url || ""
    expect(joinerWebsocketUrl).not.toContain("ooc")
  })
})
