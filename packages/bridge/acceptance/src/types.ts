/**
 * Key pair for ECDH key exchange
 */
export interface KeyPair {
  privateKey: Uint8Array
  publicKey: Uint8Array
}

/**
 * Bridge event types
 */
export enum BridgeEventType {
  Connected = "connected",
  SecureChannelEstablished = "secure-channel-established",
  RawMessageReceived = "raw-message-received",
  MessageReceived = "message-received",
  ChunkRecieved = "chunk-received",
  Error = "error",
  FailedToConnect = "failed-to-connect",
  Disconnected = "disconnected",
}

/**
 * Bridge failed to connect event
 */
export interface FailedToConnectEventOptions {
  code: number
  reason: string
  event: CloseEvent
}

export class FailedToConnectEvent {
  public readonly code: number
  public readonly reason: string
  public readonly event: CloseEvent

  constructor(options: FailedToConnectEventOptions) {
    this.code = options.code
    this.reason = options.reason
    this.event = options.event
  }
}

/**
 * Bridge disconnected event
 */
export interface BridgeDisconnectedEventOptions {
  code: number
  reason: string
  wasConnected: boolean
  wasIntentionalClose: boolean
  willReconnect: boolean
  event: CloseEvent
}

export class BridgeDisconnectedEvent {
  public readonly code: number
  public readonly reason: string
  public readonly wasConnected: boolean
  public readonly wasIntentionalClose: boolean
  public readonly willReconnect: boolean
  public readonly event: CloseEvent

  constructor(options: BridgeDisconnectedEventOptions) {
    this.code = options.code
    this.reason = options.reason
    this.wasConnected = options.wasConnected
    this.wasIntentionalClose = options.wasIntentionalClose
    this.willReconnect = options.willReconnect
    this.event = options.event
  }
}

/**
 * Bridge event callback types
 */
export type BridgeEventCallback = {
  [BridgeEventType.Connected]: (reconnection: boolean) => void
  [BridgeEventType.SecureChannelEstablished]: () => void
  [BridgeEventType.RawMessageReceived]: (message: any) => void
  [BridgeEventType.MessageReceived]: (message: any) => void
  [BridgeEventType.ChunkRecieved]: (message: any) => void
  [BridgeEventType.Error]: (error: string) => void
  [BridgeEventType.FailedToConnect]: (event: FailedToConnectEvent) => void
  [BridgeEventType.Disconnected]: (event: BridgeDisconnectedEvent) => void
}

/**
 * Interface for bridge connection options
 */
export interface BridgeOptions {
  role: "creator" | "joiner"
  keyPair: KeyPair
  bridgeId?: string
  reconnect?: boolean
  reconnectAttempts?: number
  keepalive?: boolean
  origin?: string
  domain?: string
  pingInterval?: number
  bridgeUrl?: string
  originOnConnect?: boolean
}
