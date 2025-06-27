export class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  // Static hub to manage connections between MockWebSocket instances
  private static hub: Map<string, MockWebSocket[]> = new Map()

  onopen: (() => void) | null = null
  onmessageHandlers: ((event: { data: string }) => void)[] = []
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string }) => void) | null = null
  oncloseHandlers: ((event: { code: number; reason: string }) => void)[] = []
  private readyState: number
  private url: string
  public origin: string | null = null
  private receivedMessages: string[] = []
  private hubChannel: string | null = null
  private onConnectInterceptor: (() => void) | null = null
  private onSendInterceptor: ((data: string) => string | undefined) | null = null

  constructor(
    url: string,
    {
      headers,
      hubChannel,
      onConnectInterceptor,
      onSendInterceptor,
    }: {
      headers?: Record<string, string>
      hubChannel?: string
      onConnectInterceptor?: () => void
      onSendInterceptor?: (data: string) => string | undefined
    } = {},
  ) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.origin = headers?.Origin || null
    this.hubChannel = hubChannel || null
    this.onConnectInterceptor = onConnectInterceptor || null
    this.onSendInterceptor = onSendInterceptor || null

    // Register with hub if a channel is specified
    if (this.hubChannel) {
      if (!MockWebSocket.hub.has(this.hubChannel)) {
        MockWebSocket.hub.set(this.hubChannel, [])
      }
      MockWebSocket.hub.get(this.hubChannel)?.push(this)
    }

    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onConnectInterceptor) this.onConnectInterceptor()
      if (this.onopen) this.onopen()
    }, 10)
  }

  send(data: string) {
    // Don't send messages if the socket is closed
    if (this.readyState !== MockWebSocket.OPEN) {
      return
    }

    if (this.onSendInterceptor) {
      const result = this.onSendInterceptor(data)
      // Use the interceptor's return value as the new data if provided
      if (result !== undefined) {
        data = result
      }
    }

    // If connected to a hub, relay the message to other sockets in the same channel
    if (this.hubChannel && MockWebSocket.hub.has(this.hubChannel)) {
      const connectedSockets = MockWebSocket.hub.get(this.hubChannel) || []

      // Send to all other sockets in the same channel
      for (const socket of connectedSockets) {
        if (socket !== this && socket.getReadyState() === MockWebSocket.OPEN) {
          socket.receiveMessage(data)
        }
      }
    }
  }

  // Method to handle incoming messages
  private receiveMessage(data: string) {
    this.receivedMessages.push(data)

    // Trigger message handlers
    if (this.onmessage) {
      this.onmessage({ data })
    }

    for (const handler of this.onmessageHandlers) {
      handler({ data })
    }
  }

  // Method to wait for a message to be received
  async waitForMessage(timeout = 1000): Promise<string> {
    if (this.receivedMessages.length > 0) {
      return this.receivedMessages.shift()!
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Timeout waiting for message"))
      }, timeout)

      const messageHandler = (event: { data: string }) => {
        clearTimeout(timeoutId)
        this.onmessageHandlers = this.onmessageHandlers.filter((h) => h !== messageHandler)
        resolve(event.data)
      }

      this.onmessageHandlers.push(messageHandler)
    })
  }

  close(code = 1000, reason = "Normal closure") {
    // Only trigger close events if the socket was open
    const wasOpen = this.readyState === MockWebSocket.OPEN

    this.readyState = MockWebSocket.CLOSED

    // Remove from hub if connected
    if (this.hubChannel && MockWebSocket.hub.has(this.hubChannel)) {
      const sockets = MockWebSocket.hub.get(this.hubChannel) || []
      const index = sockets.indexOf(this)
      if (index !== -1) {
        sockets.splice(index, 1)
      }

      // Clean up empty channels
      if (sockets.length === 0) {
        MockWebSocket.hub.delete(this.hubChannel)
      }
    }

    // Trigger close events if the socket was previously open
    if (wasOpen) {
      this.triggerCloseHandlers(code, reason)
    }
  }

  // Method to simulate a server-side disconnect
  simulateServerDisconnect(code = 1006, reason = "Server closed connection") {
    if (this.readyState === MockWebSocket.OPEN) {
      this.readyState = MockWebSocket.CLOSED

      // Trigger close handlers
      this.triggerCloseHandlers(code, reason)

      // Remove from hub but don't affect other connections
      if (this.hubChannel && MockWebSocket.hub.has(this.hubChannel)) {
        const sockets = MockWebSocket.hub.get(this.hubChannel) || []
        const index = sockets.indexOf(this)
        if (index !== -1) {
          sockets.splice(index, 1)
        }
      }
    }
  }

  // Helper to trigger all close handlers
  private triggerCloseHandlers(code: number, reason: string) {
    const closeEvent = { code, reason }

    if (this.onclose) {
      this.onclose(closeEvent)
    }

    for (const handler of this.oncloseHandlers) {
      handler(closeEvent)
    }
  }

  addEventListener(event: string, callback: (event: any) => void) {
    if (event === "open") {
      this.onopen = callback as () => void
    } else if (event === "message") {
      this.onmessageHandlers.push(callback as (event: { data: string }) => void)
    } else if (event === "close") {
      this.oncloseHandlers.push(callback as (event: { code: number; reason: string }) => void)
    }
  }

  removeEventListener(event: string, callback: (event: any) => void) {
    if (event === "open" && this.onopen === callback) {
      this.onopen = null
    } else if (event === "message") {
      this.onmessageHandlers = this.onmessageHandlers.filter((h) => h !== callback)
    } else if (event === "close") {
      this.oncloseHandlers = this.oncloseHandlers.filter((h) => h !== callback)
    }
  }

  getReadyState() {
    return this.readyState
  }

  // Static method to clear all hub connections (useful for test cleanup)
  static clearHub() {
    MockWebSocket.hub.clear()
  }

  // Static method to simulate a server-side disconnect for all connections in a channel
  static simulateServerDisconnectForChannel(
    channel: string,
    code = 1006,
    reason = "Server closed connection",
  ) {
    if (MockWebSocket.hub.has(channel)) {
      const sockets = [...(MockWebSocket.hub.get(channel) || [])]
      for (const socket of sockets) {
        socket.simulateServerDisconnect(code, reason)
      }
    }
  }
}

// This is a mock function that mimics the behavior of the bridge server on client connect
const mockBridgeServerClientConnect = function () {
  // If the WebSocket URI used to connect contains a pubkey param, the server will automatically
  // broadcast a handshake message to all connected clients
  if (this.url) {
    const url = new URL(this.url)
    const pubkey = url.searchParams.get("pubkey")
    const greeting = url.searchParams.get("greeting")
    if (pubkey && greeting) {
      setTimeout(async () => {
        this.send(
          JSON.stringify({
            method: "handshake",
            params: { pubkey, greeting },
          }),
        )
      }, 10)
    }
  }
}

// This is a mock function that mimics the behavior of the bridge server on message relay
const mockBridgeServerMessageRelay = function (data: string): string | undefined {
  // The WebSocket server will parse the data as JSON and throw error if invalid
  let parsedData: any
  try {
    parsedData = JSON.parse(data)
  } catch (error) {
    throw new Error("Invalid JSON: " + error.message)
  }
  // The WebSocket server will set the origin property on every message relayed if the origin is set
  if (this.origin) parsedData.origin = this.origin
  return JSON.stringify(parsedData)
}

export const mockWebSocket = () => {
  return {
    getWebSocketClient: jest.fn((url: string, origin: string) => {
      // Extract topic/bridgeId from url for use in MockWebSocket
      const urlObj = new URL(url)
      const topicFromUrl = urlObj.searchParams.get("topic") || ""
      const websocket = new MockWebSocket(url, {
        headers: { Origin: origin },
        hubChannel: topicFromUrl, // Use topic from URL
        onConnectInterceptor: mockBridgeServerClientConnect,
        onSendInterceptor: mockBridgeServerMessageRelay,
      })
      return websocket
    }),
  }
}
