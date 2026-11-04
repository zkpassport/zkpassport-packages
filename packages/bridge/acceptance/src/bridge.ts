import { bytesToHex } from "@noble/ciphers/utils"
import { BridgeConnection } from "./bridge-connection"
import { generateECDHKeyPair } from "./encryption"
import { WebSocketClient } from "./websocket"
import debug from "debug"
import type { KeyPair } from "./types"
import { BridgeDisconnectedEvent, FailedToConnectEvent } from "./types"

/**
 * Options for creating a bridge
 */
export interface CreateOptions {
  origin?: string
  bridgeId?: string
  keyPair?: KeyPair
  resume?: boolean
  remotePublicKey?: Uint8Array
  autoconnect?: boolean
  reconnect?: boolean
  keepalive?: boolean
  debug?: boolean
  pingInterval?: number
  bridgeUrl?: string
  originOnConnect?: boolean
}

/**
 * Options for joining a bridge
 */
export interface JoinOptions {
  keyPair?: KeyPair
  resume?: boolean
  reconnect?: boolean
  keepalive?: boolean
  debug?: boolean
  pingInterval?: number
  bridgeUrl?: string
  originOnConnect?: boolean
}

/**
 * Functional bridge interface returned by create() and join()
 */
export interface BridgeInterface extends Disposable {
  websocket: WebSocketClient | undefined
  connection: BridgeConnection
  onConnect: (callback: (reconnection: boolean) => void) => () => void
  onFailedToConnect: (callback: (event: FailedToConnectEvent) => void) => () => void
  onSecureChannelEstablished: (callback: () => void) => () => void
  onRawMessage: (callback: (message: any) => void) => () => void
  onSecureMessage: (callback: (message: any) => void) => () => void
  onError: (callback: (error: string) => void) => () => void
  onDisconnect: (callback: (event: BridgeDisconnectedEvent) => void) => () => void
  isBridgeConnected: () => boolean
  isSecureChannelEstablished: () => boolean
  sendMessage: (method: string, params?: any) => Promise<boolean>
  connectionString: string
  origin: string
  bridgeId: string
  getPublicKey: () => string
  getRemotePublicKey: () => string
  getKeyPair: () => KeyPair
  // TODO: Deprecate close() and use cleanup() instead
  close: () => void
  cleanup: () => void
}

/**
 * Main Bridge class - provides static methods for creating and joining bridges
 */
export class Bridge {
  /**
   * Create a new bridge connection as the creator
   * @param options Options for creating a bridge
   * @returns A promise that resolves to a functional bridge interface
   */
  public static async create(options: CreateOptions = {}): Promise<BridgeInterface> {
    // Enable debug mode if requested
    if (options.debug) debug.enable("bridge*")

    // Set autoconnect default to true
    const autoconnect = options.autoconnect ?? true

    // Get origin
    if (options.origin && typeof window !== "undefined") {
      throw new Error("Origin can't be specified when running in browser")
    }
    if (!options.origin && typeof window === "undefined") {
      options.origin = "nodejs"
    }
    const origin = options.origin || window?.location?.protocol + "//" + window?.location?.hostname

    // Handle arguments for resuming an existing bridge session
    if (options.remotePublicKey && !options.resume) {
      throw new Error("Can only provide remotePublicKey when resuming a bridge session")
    }
    if (options.resume && (!options.keyPair || !options.remotePublicKey)) {
      throw new Error("Resuming a bridge session requires a keyPair and remotePublicKey")
    }

    // Use provided key pair or generate a new one
    const keyPair = options.keyPair || generateECDHKeyPair()

    // Use creator's public key as the bridge ID
    const bridgeId = bytesToHex(keyPair.publicKey)

    // Create connection instance with creator role
    const connection = new BridgeConnection({
      role: "creator",
      origin,
      bridgeId,
      keyPair,
      reconnect: options.reconnect,
      keepalive: options.keepalive,
      pingInterval: options.pingInterval,
      bridgeUrl: options.bridgeUrl,
      originOnConnect: options.originOnConnect ?? true,
    })

    // Resume existing bridge session if requested
    if (options.resume) {
      // Set remote public key
      connection.setRemotePublicKey(options.remotePublicKey!)
      // Compute shared secret
      await connection.computeSharedSecret()
      connection.resume()
    }

    // Connect to the bridge service if autoconnect option is true (default behaviour)
    if (options.resume || autoconnect) {
      await connection.connect(await connection._getWsConnectionUrl())
    }

    // Return functional interface
    return {
      websocket: connection.getWebSocket(),
      connection: connection,
      onConnect: (callback) => connection.onConnect(callback),
      onFailedToConnect: (callback) => connection.onFailedToConnect(callback),
      onSecureChannelEstablished: (callback) => connection.onSecureChannelEstablished(callback),
      onRawMessage: (callback) => connection.onRawMessage(callback),
      onSecureMessage: (callback) => connection.onSecureMessage(callback),
      onError: (callback) => connection.onError(callback),
      onDisconnect: (callback) => connection.onDisconnect(callback),
      isBridgeConnected: () => connection.isBridgeConnected(),
      isSecureChannelEstablished: () => connection.isSecureChannelEstablished(),
      sendMessage: (method, params) => connection.sendSecureMessage(method, params || {}),
      connectionString: connection.connectionString!,
      bridgeId: connection.getBridgeId(),
      origin: connection.bridgeOrigin,
      getKeyPair: () => connection.keyPair,
      getPublicKey: () => connection.getPublicKey(),
      // TODO: Deprecate close() and use cleanup() instead
      getRemotePublicKey: () => connection.getRemotePublicKey(),
      close: () => connection.cleanup(),
      cleanup: () => connection.cleanup(),
      [Symbol.dispose]: () => connection.cleanup(),
    }
  }

  /**
   * Join an existing bridge connection as the joiner
   * @param uri The connection string from the creator
   * @param options Options for joining a bridge
   * @returns A promise that resolves to a functional bridge interface
   */
  public static async join(uri: string, options: JoinOptions = {}): Promise<BridgeInterface> {
    // Enable debug mode if requested
    if (options.debug) {
      debug.enable("bridge*")
    }

    // Handle arguments for resuming an existing bridge session
    if (options.resume && !options.keyPair) {
      throw new Error("Resuming a bridge session requires a keyPair")
    }

    // Use provided key pair or generate a new one
    const keyPair = options.keyPair || generateECDHKeyPair()

    // Parse URL parameters
    const { domain, pubkey, ooc } = Bridge.parseConnectionString(uri)

    // Determine originOnConnect: use explicit option if provided, otherwise use value from connection string
    const originOnConnect = options.originOnConnect !== undefined ? options.originOnConnect : ooc

    // Create connection instance with joiner role and domain
    const connection = new BridgeConnection({
      role: "joiner",
      domain: domain,
      bridgeId: pubkey,
      keyPair,
      reconnect: options.reconnect,
      keepalive: options.keepalive,
      pingInterval: options.pingInterval,
      bridgeUrl: options.bridgeUrl,
      originOnConnect,
    })

    // Set remote public key
    connection.setRemotePublicKey(new Uint8Array(Buffer.from(pubkey, "hex")))

    // Compute shared secret
    await connection.computeSharedSecret()

    // Resume existing bridge session if requested
    if (options.resume) connection.resume()

    // Connect to the bridge service
    await connection.connect(await connection._getWsConnectionUrl())

    // Return functional interface
    return {
      websocket: connection.getWebSocket(),
      connection: connection,
      onConnect: (callback) => connection.onConnect(callback),
      onFailedToConnect: (callback) => connection.onFailedToConnect(callback),
      onSecureChannelEstablished: (callback) => connection.onSecureChannelEstablished(callback),
      onRawMessage: (callback) => connection.onRawMessage(callback),
      onSecureMessage: (callback) => connection.onSecureMessage(callback),
      onError: (callback) => connection.onError(callback),
      onDisconnect: (callback) => connection.onDisconnect(callback),
      isBridgeConnected: () => connection.isBridgeConnected(),
      isSecureChannelEstablished: () => connection.isSecureChannelEstablished(),
      sendMessage: (method, params) => connection.sendSecureMessage(method, params || {}),
      connectionString: connection.connectionString!,
      bridgeId: connection.getBridgeId(),
      origin: connection.bridgeOrigin,
      getKeyPair: () => connection.keyPair,
      getPublicKey: () => connection.getPublicKey(),
      getRemotePublicKey: () => connection.getRemotePublicKey(),
      // TODO: Deprecate close() and use cleanup() instead
      close: () => connection.cleanup(),
      cleanup: () => connection.cleanup(),
      [Symbol.dispose]: () => connection.cleanup(),
    }
  }

  private static parseConnectionString(uri: string): { domain: string; pubkey: string; ooc: boolean } {
    const parsedUri = new URL(uri)
    const pubkey = parsedUri.pathname
    let domain = parsedUri.searchParams.get("d")
    const ooc = parsedUri.searchParams.has("ooc")
    if (!domain || !pubkey) {
      throw new Error("Invalid connection string: missing required parameters")
    }
    // Default to https if no protocol is specified
    if (domain !== "nodejs" && !domain.startsWith("http")) domain = "https://" + domain
    return { domain, pubkey, ooc }
  }

  /**
   * Generate a new ECDH key pair
   * @returns A promise that resolves to a key pair
   */
  public static async generateKeyPair(): Promise<KeyPair> {
    return generateECDHKeyPair()
  }
}
