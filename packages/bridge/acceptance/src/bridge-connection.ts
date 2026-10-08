import debug from "debug"
import { inflate } from "pako"
import { bytesToHex } from "@noble/ciphers/utils"
import { decrypt, encrypt, getSharedSecret } from "./encryption"
import { sendEncryptedJsonRpcRequest } from "./json-rpc"
import { getWebSocketClient, WebSocketClient } from "./websocket"
import { parseOriginHeader, generateRandomId } from "./utils"
import {
  DEFAULT_MAX_RECONNECT_ATTEMPTS,
  DEFAULT_PING_INTERVAL,
  DEFAULT_WS_ENDPOINT,
  PROTOCOL_VERSION,
} from "./constants"
import type { BridgeEventCallback, BridgeOptions, KeyPair } from "./types"
import { BridgeEventType, BridgeDisconnectedEvent as DisconnectedEvent, FailedToConnectEvent } from "./types"

/**
 * BridgeConnection implementation
 *
 * A single class that handles both creator and joiner roles and manages its own state
 */
export class BridgeConnection {
  private log: debug.Debugger
  private role: "creator" | "joiner"
  private origin?: string
  private _bridgeOrigin?: string
  private bridgeId: string
  public readonly keyPair: KeyPair
  private remotePublicKey?: Uint8Array
  private sharedSecret?: Uint8Array
  private websocket?: WebSocketClient
  private secureChannelEstablished = false
  private intentionalClose = false
  public readonly keepalive: boolean
  private reconnect: boolean
  private reconnectAttempts = 0
  private maxReconnectAttempts: number
  private reconnectTimer?: Timer
  private pingTimer?: Timer
  private pingInterval = 30000
  private isReconnecting = false
  private isConnected = false
  private resumedSession = false
  private bridgeUrl?: string
  private validMessagesReceived = 0
  private lastMessageTimestamp: number = 0
  private originOnConnect: boolean
  private _originValidatedViaOoc = false

  // Event handlers
  private eventListeners: {
    [BridgeEventType.Connected]: Array<(reconnection: boolean) => void>
    [BridgeEventType.SecureChannelEstablished]: Array<() => void>
    [BridgeEventType.RawMessageReceived]: Array<(message: any) => void>
    [BridgeEventType.MessageReceived]: Array<(message: any) => void>
    [BridgeEventType.ChunkRecieved]: Array<(message: any) => void>
    [BridgeEventType.Error]: Array<(error: string) => void>
    [BridgeEventType.FailedToConnect]: Array<(event: FailedToConnectEvent) => void>
    [BridgeEventType.Disconnected]: Array<(event: DisconnectedEvent) => void>
  }

  // Map to store incomplete messages
  private incompleteMessages: Map<string, { chunks: string[]; expectedChunks: number; timestamp: number }> = new Map()

  // Set to track seen JSON RPC message IDs (both sent and received)
  private seenMessageIds: Set<string> = new Set()

  /**
   * Create a new bridge connection
   * @param options Connection options
   */
  constructor(options: BridgeOptions) {
    this.role = options.role
    this.origin = options.origin
    this._bridgeOrigin = options.domain
    this.log = debug(`bridge:${this.role}`)
    this.bridgeId = options.bridgeId || generateRandomId(16)
    this.keyPair = options.keyPair
    this.reconnect = options.reconnect ?? true
    this.keepalive = options.keepalive ?? true
    this.maxReconnectAttempts = options.reconnectAttempts || DEFAULT_MAX_RECONNECT_ATTEMPTS
    this.pingInterval = options.pingInterval || DEFAULT_PING_INTERVAL
    this.bridgeUrl = options.bridgeUrl ?? DEFAULT_WS_ENDPOINT
    // Both creator and joiner can control originOnConnect (defaults to true)
    this.originOnConnect = options.originOnConnect ?? true

    // Initialize event listeners
    this.eventListeners = {
      [BridgeEventType.Connected]: [],
      [BridgeEventType.SecureChannelEstablished]: [],
      [BridgeEventType.RawMessageReceived]: [],
      [BridgeEventType.MessageReceived]: [],
      [BridgeEventType.ChunkRecieved]: [],
      [BridgeEventType.Error]: [],
      [BridgeEventType.FailedToConnect]: [],
      [BridgeEventType.Disconnected]: [],
    }
  }

  public resume(): void {
    this.log("Resuming bridge session")
    this.secureChannelEstablished = true
    this.resumedSession = true
  }

  /**
   * Add an event listener
   * @param event The event type
   * @param callback The callback function
   * @returns Function to remove the event listener
   */
  public on<T extends BridgeEventType>(event: T, callback: BridgeEventCallback[T]): () => void {
    this.eventListeners[event].push(callback as any)
    return () => this.off(event, callback)
  }

  /**
   * Remove an event listener
   * @param event The event type
   * @param callback The callback function
   */
  public off<T extends BridgeEventType>(event: T, callback: BridgeEventCallback[T]): void {
    const index = this.eventListeners[event].indexOf(callback as any)
    if (index !== -1) {
      this.eventListeners[event].splice(index, 1)
    }
  }

  /**
   * Emit an event
   * @param event The event type
   * @param args The event arguments
   */
  private async emit<T extends BridgeEventType>(event: T, ...args: Parameters<BridgeEventCallback[T]>): Promise<void> {
    await Promise.all(
      this.eventListeners[event].map(async (listener) => {
        try {
          await (listener as (...args: any[]) => Promise<void> | void)(...args)
        } catch (error) {
          this.log(`Error in ${event} listener:`, error)
        }
      })
    )
  }

  /**
   * Set up WebSocket event handlers
   */
  private setupWebSocketHandlers(websocket: WebSocketClient): void {
    websocket.onopen = async () => {
      this.isConnected = true

      // Set up ping timer
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => {
        if (this.websocket) this.websocket.send(JSON.stringify({ method: "ping", params: {}, nocache: true }))
      }, this.pingInterval)

      // Emit the connected event
      if (this.isReconnecting) {
        this.log("Reconnected to bridge")

        // Reset state relating to reconnection
        this.resetReconnection()

        // Request message replay if we have a last message timestamp
        if (this.lastMessageTimestamp > 0 && this.websocket) {
          const replayTimestamp = this.lastMessageTimestamp - 1000
          this.log(`Requesting message replay starting from ${replayTimestamp}`)
          this.websocket.send(JSON.stringify({ method: "replay", params: { timestamp: replayTimestamp } }))
        }
        // Emit the connected event with reconnection flag set to true
        await this.emit(BridgeEventType.Connected, true)
      } else {
        this.log("Connected to bridge")

        // Set initial timestamp for requesting message replay if needed
        if (this.lastMessageTimestamp === 0) this.lastMessageTimestamp = Date.now()

        // Emit the connected event
        await this.emit(BridgeEventType.Connected, false)

        // Fire the initial secure channel established event if this session was resumed
        if (this.resumedSession) {
          this.log("Resumed session, emitting secure channel established event")
          await this.emit(BridgeEventType.SecureChannelEstablished)
        }
      }
    }

    websocket.onmessage = async (event: any) => {
      // Emit the raw message received event
      await this.emit(BridgeEventType.RawMessageReceived, event.data)

      try {
        const data = JSON.parse(event.data)
        await this.handleWebSocketMessage(data)
      } catch (error) {
        this.log("Error parsing message:", error)
        await this.emit(
          BridgeEventType.Error,
          `Error parsing message: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    websocket.onclose = async (event: CloseEvent) => {
      const { code, reason, wasClean } = event
      this.log("[websocket.onclose]", { code, reason, wasClean, readyState: websocket.readyState })

      // Clear the ping timer if it is set
      if (this.pingTimer) clearInterval(this.pingTimer)

      // If connected then fire a Disconnected event
      if (this.isConnected) {
        const disconnectedEvent = new DisconnectedEvent({
          code: event.code,
          reason: event.reason,
          wasConnected: this.isConnected,
          wasIntentionalClose: this.intentionalClose,
          willReconnect: !this.intentionalClose && this.isConnected && this.reconnect,
          event: event,
        })
        await this.emit(BridgeEventType.Disconnected, disconnectedEvent)
      }

      // If the close was intentional then cleanup and return
      if (this.intentionalClose) {
        this.log("Intentional close, not attempting reconnect")
        this._handleCleanup()
        return
      }

      // If not yet connected then fire a FailedToConnect event and return
      // This is often due to a network or DNS error
      if (!this.isConnected) {
        const isConnectionError = !this.isConnected && !this.intentionalClose
        if (isConnectionError) {
          const failedToConnectEvent = new FailedToConnectEvent({
            code: event.code,
            reason: event.reason,
            event: event,
          })
          await this.emit(BridgeEventType.FailedToConnect, failedToConnectEvent)
        }
        return
      }

      // This point is only reached if the connection was established prior to closing and .cleanup() was not called
      this.log("WebSocket closed")
      this.isConnected = false
      if (this.reconnect) await this.handleReconnect()
    }
  }

  /**
   * Handle WebSocket messages based on message type
   */
  private async handleWebSocketMessage(data: any): Promise<void> {
    // Respond to ping messages
    if (data.method === "ping") {
      this.log("Received ping message, responding with pong")
      this.websocket?.send(JSON.stringify({ method: "pong", params: {}, nocache: true }))
      return
    }
    // Ignore pong messages
    if (data.method === "pong") return

    // Handle origin on connect (ooc) message from server (joiner only)
    if (this.role === "joiner" && data.method === "ooc" && data.params?.origin) {
      // Only process ooc if we actually requested it
      if (!this.originOnConnect) {
        this.log("WARNING: Ignoring unsolicited ooc message")
        return
      }
      // Ignore if secure channel is already established
      if (this.secureChannelEstablished) {
        this.log("WARNING: Secure channel already established. Ignoring ooc message")
        return
      }

      const receivedOrigin = parseOriginHeader(data.params.origin)
      this.log("Received origin on connect:", receivedOrigin)

      // If we already have an expected origin from the connection string, verify it matches
      if (this._bridgeOrigin && this._bridgeOrigin !== receivedOrigin) {
        this.log(`WARNING: Expected origin ${this._bridgeOrigin} but got ${receivedOrigin} (via ooc)`)
        await this.emit(
          BridgeEventType.Error,
          `Origin on connect ${receivedOrigin} does not match expected origin ${this._bridgeOrigin}`
        )
        return
      }
      // Store the bridge origin if not already set
      if (!this._bridgeOrigin) {
        this._bridgeOrigin = receivedOrigin
        this.log("Set bridge origin from ooc:", this._bridgeOrigin)
      }
      // Mark that origin was validated via ooc
      this._originValidatedViaOoc = true
      // Consider this as a secure channel established event
      // TODO: Should the BridgeEventType.DomainVerified event be brought back and used for this instead?
      this.secureChannelEstablished = true
      await this.emit(BridgeEventType.SecureChannelEstablished)
      return
    }

    // Check for missing message id
    if (!data.id) {
      this.log("Ignoring message with missing id:", data)
      return
    }

    // Check for duplicate message id
    if (this.seenMessageIds.has(data.id)) {
      this.log("Ignoring message with duplicate id:", data.id)
      return
    }
    // Track this message ID
    this.seenMessageIds.add(data.id)
    this.validMessagesReceived += 1

    // Record timestamp of when the last message was received
    this.lastMessageTimestamp = Date.now()

    // Handle handshake message (for creator role)
    if (this.role === "creator" && data.method === "handshake") {
      // TODO: This may be the ideal behaviour rather than responding with an error
      // if (this.secureChannelEstablished) {
      //   this.log("Secure channel already established, ignoring handshake message")
      //   return
      // }
      this.log("Processing handshake message")
      await this.handleHandshake(data)
    }

    // Handle encrypted messages
    if (data.method === "encryptedMessage") {
      this.log("Processing encrypted message")

      // For joiner role, verify origin from creator message matches expected origin
      if (this.role === "joiner" && this._bridgeOrigin) {
        const parsedOrigin = data.origin ? parseOriginHeader(data.origin) : undefined
        if (parsedOrigin !== this._bridgeOrigin) {
          this.log(
            `WARNING: Origin differs from origin in connection string. Expected ${this._bridgeOrigin} but got ${parsedOrigin}`
          )
          this.log("Ignoring received message:", data)
          this.emit(
            BridgeEventType.Error,
            `Origin ${parsedOrigin} does not match expected origin ${this._bridgeOrigin}`
          )
          return
        }
      }

      // Call handler for encrypted messages
      await this.handleEncryptedMessage(data)
    }
  }

  /**
   * Handle handshake message (for creator)
   */
  private async handleHandshake(data: any): Promise<void> {
    this.log("Received handshake:", data)
    try {
      // Get joiner public key
      const joinerPublicKey = new Uint8Array(Buffer.from(data.params.pubkey, "hex"))
      // If secure channel is already established, the remote public key cannot be changed
      if (this.secureChannelEstablished) {
        if (this.remotePublicKey !== joinerPublicKey) {
          this.log("Secure channel already established, ignoring handshake")
          this.emit(BridgeEventType.Error, "Secure channel already established, ignoring handshake")
          // TODO: Improve handshake error handling and how it responds / rejects the handshake
          this.websocket?.send(
            JSON.stringify({
              method: "error",
              params: { message: "Secure channel already established, ignoring handshake" },
            })
          )
          return
        }
      }

      // Set remote public key
      this.remotePublicKey = joinerPublicKey

      // Compute shared secret
      this.sharedSecret = getSharedSecret(this.keyPair.privateKey, joinerPublicKey)

      // Decrypt greeting
      const greeting = await decrypt(Buffer.from(data.params.greeting, "hex"), this.sharedSecret, this.bridgeId)
      if (greeting !== "hello") throw new Error("Invalid greeting")

      // Send hello message back to joiner to finalize handshake
      if (this.websocket) {
        const result = await sendEncryptedJsonRpcRequest(
          "hello",
          null,
          this.sharedSecret,
          this.bridgeId,
          this.websocket
        )
        // Track the message IDs we sent
        result.messageIds.forEach((id) => this.seenMessageIds.add(id))
      }

      // Only emit secure channel established event if it hasn't been emitted yet
      if (this.secureChannelEstablished) {
        this.log("Secure channel already established, sending handshake message again")
      } else {
        // Mark secure channel as established
        this.secureChannelEstablished = true
        await this.emit(BridgeEventType.SecureChannelEstablished)
      }
    } catch (error) {
      this.log("Error handling handshake:", error)
      await this.emit(
        BridgeEventType.Error,
        `Error handling handshake: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Handle encrypted message
   */
  private async handleEncryptedMessage(data: any): Promise<void> {
    try {
      // decrypt the message
      if (!this.sharedSecret) throw new Error("Shared secret not available")
      const payload = new Uint8Array(Buffer.from(data.params.payload, "base64"))
      const decrypted = await decrypt(payload, this.sharedSecret, this.bridgeId)
      const decryptedJson = JSON.parse(decrypted)
      if (!decryptedJson.chunk || decryptedJson.chunk.length == 1) {
        if (decryptedJson.method === "hello" && !this.secureChannelEstablished) {
          // handle handshake message
          this.log(`Verified origin: ${data.origin}`)
          this.secureChannelEstablished = true
          // Notify listeners about the received message
          await this.emit(BridgeEventType.SecureChannelEstablished)
        } else {
          // if has payload, attempt to decompress it it
          try {
            if (decryptedJson.params && decryptedJson.params.length > 0) {
              this.log(`Received compressed single-part message`)
              const compressedData = Buffer.from(decryptedJson.params, "base64")
              const decompressedData = inflate(compressedData)
              const decompressedText = new TextDecoder().decode(decompressedData)
              decryptedJson.params = JSON.parse(decompressedText)
              delete decryptedJson.chunk
            }
          } catch (error) {
            // ensure error was due to compression
            // this is included to ensure legacy messages are not rejected
            if (error !== "incorrect header check") {
              console.error("Some error happened data:", error)
              throw new Error("Failed to parse data: ")
            }
            this.log(`Received uncompressed single-part message`)
            // check if the data needs to be json parsed
            try {
              decryptedJson.params = JSON.parse(decryptedJson.params)
            } catch {
              // Ignore error
            }
          }
          // Notify listeners about the received message
          await this.emit(BridgeEventType.MessageReceived, decryptedJson)
        }
      } else {
        // handle chunked messages
        const { index, length, id } = decryptedJson.chunk
        this.log(`Received chunk (${index + 1}/${length}) for chunk id ${id}`)

        // Initialize incomplete message storage if this is the first chunk we receive for this id
        if (!this.incompleteMessages.has(id)) {
          this.incompleteMessages.set(id, {
            chunks: new Array(length), // Pre-allocate array with correct length
            expectedChunks: length,
            timestamp: Date.now(),
          })
        }

        const message = this.incompleteMessages.get(id)!

        // Verify the expected chunks count matches
        if (message.expectedChunks !== length) {
          this.log(`Chunk count mismatch for id ${id}. Expected ${message.expectedChunks}, got ${length}`)
          throw new Error(`Chunk count mismatch for id ${id}. Expected ${message.expectedChunks}, got ${length}`)
        }

        // Store the chunk at the correct index
        message.chunks[index] = decryptedJson.params
        await this.emit(BridgeEventType.ChunkRecieved, decryptedJson.chunk)

        // Check if we have received all chunks (no undefined values in the array)
        const allChunksReceived = (() => {
          for (let i = 0; i < message.chunks.length; i++) {
            if (message.chunks[i] === undefined) {
              return false
            }
          }
          return true
        })()

        if (allChunksReceived) {
          // recompose the chunks into the message
          const fullMessage = message.chunks.join("")
          const compressedMessage = Buffer.from(fullMessage, "base64")
          const decompressedData = inflate(compressedMessage)
          const decompressedText = new TextDecoder().decode(decompressedData)
          const decryptedPayload = JSON.parse(decompressedText)
          this.log(`Received all chunks for chunk id ${id}, reconstructing message`)
          const returnValue = { method: decryptedJson.method, params: decryptedPayload }
          // delete the message from the map
          this.incompleteMessages.delete(id)
          // Notify listeners about the received message
          await this.emit(BridgeEventType.MessageReceived, returnValue)
        }
      }
    } catch (error) {
      this.log("Error decrypting message:", error)
      await this.emit(
        BridgeEventType.Error,
        `Error decrypting message: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Handle reconnection logic
   */
  private async handleReconnect(): Promise<void> {
    this.reconnectAttempts++
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      this.log(`WebSocket disconnected, max reconnection attempts (${this.maxReconnectAttempts}) reached`)
      this.resetReconnection()
      return
    }

    this.isReconnecting = true
    this.log(`WebSocket disconnected, attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)

    let reconnectIn = 0
    // First attempt is immediate, subsequent attempts follow doubling delay pattern
    if (this.reconnectAttempts > 1) {
      // Delay pattern: 1s, 2s, 4s, 8s, etc.
      reconnectIn = 1000 * Math.pow(2, this.reconnectAttempts - 2)
      this.log(`Waiting ${reconnectIn}ms before reconnecting...`)
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        const reconnectionUrl = await this._getWsConnectionUrl()
        // Create new WebSocket connection
        this.websocket = await getWebSocketClient(reconnectionUrl, this.origin)
        this.setupWebSocketHandlers(this.websocket)
      } catch (error) {
        this.log("Reconnection failed:", error)
        await this.handleReconnect()
      }
    }, reconnectIn)
  }
  /**
   * Reset reconnection state
   */
  private resetReconnection(): void {
    this.log("Resetting reconnection state")
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
    this.reconnectAttempts = 0
    this.isReconnecting = false
  }

  /**
   * Check if the bridge is connected
   */
  public isBridgeConnected(): boolean {
    if (!this.websocket) {
      return false
    }
    return this.websocket.readyState === WebSocket.OPEN
  }

  /**
   * Check if the secure channel is established
   */
  public isSecureChannelEstablished(): boolean {
    return this.secureChannelEstablished
  }

  /**
   * Send a secure message
   * @param method The message method name
   * @param params The message parameters
   */
  public async sendSecureMessage(method: string, params: any = {}): Promise<boolean> {
    if (!this.isConnected || !this.secureChannelEstablished) {
      await this.emit(BridgeEventType.Error, "Cannot send message: Secure channel not established")
      return false
    }
    const result = await sendEncryptedJsonRpcRequest(
      method,
      params,
      this.sharedSecret!,
      // TODO: Make the nonce the JSON id of the outer message
      this.bridgeId,
      this.websocket!
    )
    // Track the message IDs we sent
    result.messageIds.forEach((id) => this.seenMessageIds.add(id))
    return result.success
  }

  /**
   * Register a callback for when the bridge connects
   * @returns Function to unsubscribe from the event
   */
  public onConnect(callback: (reconnection: boolean) => void): () => void {
    return this.on(BridgeEventType.Connected, callback)
  }

  /**
   * Register a callback for when the secure channel is established
   * @returns Function to unsubscribe from the event
   */
  public onSecureChannelEstablished(callback: () => void): () => void {
    return this.on(BridgeEventType.SecureChannelEstablished, callback)
  }

  /**
   * Register a callback for when a raw message is received
   * @returns Function to unsubscribe from the event
   */
  public onRawMessage(callback: (message: any) => void): () => void {
    return this.on(BridgeEventType.RawMessageReceived, callback)
  }

  /**
   * Register a callback for when a message is received
   * @returns Function to unsubscribe from the event
   */
  public onSecureMessage(callback: (message: any) => void): () => void {
    return this.on(BridgeEventType.MessageReceived, callback)
  }

  /**
   * Register a callback for when an error occurs
   * @returns Function to unsubscribe from the event
   */
  public onError(callback: (error: string) => void): () => void {
    return this.on(BridgeEventType.Error, callback)
  }

  /**
   * Register a callback for when the bridge fails to connect
   * @returns Function to unsubscribe from the event
   */
  public onFailedToConnect(callback: (event: FailedToConnectEvent) => void): () => void {
    return this.on(BridgeEventType.FailedToConnect, (event: FailedToConnectEvent) => callback(event))
  }

  /**
   * Register a callback for when the bridge disconnects
   * @returns Function to unsubscribe from the event
   */
  public onDisconnect(callback: (event: DisconnectedEvent) => void): () => void {
    return this.on(BridgeEventType.Disconnected, (event: DisconnectedEvent) => callback(event))
  }

  /**
   * Set the remote public key
   */
  public setRemotePublicKey(publicKey: Uint8Array): void {
    this.remotePublicKey = publicKey
  }

  /**
   * Compute the shared secret
   */
  public computeSharedSecret(): void {
    if (!this.remotePublicKey) {
      throw new Error("Remote public key not set")
    }
    this.sharedSecret = getSharedSecret(this.keyPair.privateKey, this.remotePublicKey)
  }

  /**
   * Create an encrypted greeting
   */
  public async createEncryptedGreeting(): Promise<string> {
    if (!this.sharedSecret) throw new Error("Shared secret not available")
    const greeting = await encrypt("hello", this.sharedSecret, this.bridgeId)
    return Buffer.from(greeting).toString("hex")
  }

  /**
   * Get the WebSocket connection URL
   * NOTE: If the `moc` (message on connect) param is provided in the WS URI,
   *       the bridge server will automatically base64 decode and broadcast it to the bridge on connect
   * NOTE: If the `ooc` (origin on connect) param is provided in the WS URI,
   *       the bridge server will automatically send the bridge origin to the client on connect via ooc message
   * @returns The WebSocket connection URL
   */
  public async _getWsConnectionUrl(): Promise<string> {
    if (this.role === "creator") {
      return `${this.bridgeUrl}?id=${this.getBridgeId()}&v=${PROTOCOL_VERSION}`
    } else {
      // Joiner includes ooc to request the bridge origin from the server on connect
      const oocParam = this.originOnConnect ? "&ooc" : ""
      // Add a moc (message on connect) parameter if the secure channel is not established yet
      if (!this.isSecureChannelEstablished()) {
        const greeting = await this.createEncryptedGreeting()
        // Create handshake message and encode as base64 for `moc` parameter
        const handshakeMessage = JSON.stringify({
          jsonrpc: "2.0",
          id: generateRandomId(16),
          method: "handshake",
          params: { pubkey: this.getPublicKey(), greeting: greeting },
        })
        const moc = Buffer.from(handshakeMessage).toString("base64")
        return `${this.bridgeUrl}?id=${this.getBridgeId()}&v=${PROTOCOL_VERSION}&moc=${encodeURIComponent(moc)}${oocParam}`
      } else {
        return `${this.bridgeUrl}?id=${this.getBridgeId()}&v=${PROTOCOL_VERSION}`
      }
    }
  }

  /**
   * Get the public key as a hex string
   */
  public getPublicKey(): string {
    return bytesToHex(this.keyPair.publicKey)
  }

  /**
   * Get the remote public key as a hex string
   */
  public getRemotePublicKey(): string {
    if (!this.remotePublicKey) {
      throw new Error("Remote public key not set")
    }
    return bytesToHex(this.remotePublicKey)
  }

  /**
   * Get the bridge ID
   */
  public getBridgeId(): string {
    return this.bridgeId
  }

  /**
   * Get the WebSocket client
   */
  public getWebSocket(): WebSocketClient | undefined {
    return this.websocket
  }

  /**
   * Get the bridge origin (the origin of the creator)
   */
  public get bridgeOrigin(): string {
    if (this.role === "creator") return this.origin!
    else return this._bridgeOrigin!
  }

  /**
   * Get a connection string URI for joining the bridge
   */
  public get connectionString(): string {
    const oocParam = this.originOnConnect ? "&ooc" : ""
    if (this.role === "creator") {
      return `obsidion:${this.getPublicKey()}?d=${this.bridgeOrigin!}&v=${PROTOCOL_VERSION}${oocParam}`
    } else {
      return `obsidion:${this.getBridgeId()}?d=${this.bridgeOrigin!}&v=${PROTOCOL_VERSION}${oocParam}`
    }
  }

  /**
   * Connect to the bridge service
   */
  public async connect(url: string): Promise<void> {
    try {
      this.log("Connecting to bridge...", url)
      // Create WebSocket connection to the bridge
      const websocket = await (this.origin ? getWebSocketClient(url, this.origin) : getWebSocketClient(url))
      this.websocket = websocket
      this.setupWebSocketHandlers(websocket)
    } catch (error) {
      this.log("Error connecting to bridge:", error)
      await this.emit(
        BridgeEventType.Error,
        `Error connecting to bridge: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  private _handleCleanup(): void {
    this.log("Cleaning up event listeners and associated state")

    // Cleanup timers
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = undefined

    // Clear all event listeners from the websocket
    if (this.websocket) {
      this.websocket.onopen = null
      this.websocket.onmessage = null
      this.websocket.onerror = null
      this.websocket.onclose = null
      this.websocket = undefined
    }
    // Cleanup state variables
    this.secureChannelEstablished = false
    this.sharedSecret = undefined
    this.remotePublicKey = undefined

    // Clear all event listeners
    this.eventListeners = {
      [BridgeEventType.Connected]: [],
      [BridgeEventType.SecureChannelEstablished]: [],
      [BridgeEventType.RawMessageReceived]: [],
      [BridgeEventType.MessageReceived]: [],
      [BridgeEventType.ChunkRecieved]: [],
      [BridgeEventType.Error]: [],
      [BridgeEventType.FailedToConnect]: [],
      [BridgeEventType.Disconnected]: [],
    }
  }

  /**
   * Close the bridge and cleanup all event listeners and associated state
   */
  public cleanup(): void {
    this.log("Closing connection to bridge")
    this.intentionalClose = true
    this.websocket?.close(1000, "Connection closed by user")
  }
}
