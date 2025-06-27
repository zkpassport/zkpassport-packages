import { WebSocket } from "ws"
import { mockWebSocket } from "./tests/helpers/mock-websocket"

// Mock @obsidion/bridge module
jest.mock("@obsidion/bridge", () => {
  // Create a mock public key
  const mockPublicKey = new Uint8Array(32)
  for (let i = 0; i < mockPublicKey.length; i++) {
    mockPublicKey[i] = i
  }

  const mockBridgeInstance = {
    connect: jest.fn(),
    onMessage: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    getWebSocketClient: mockWebSocket().getWebSocketClient,
    getPublicKey: jest.fn().mockReturnValue(mockPublicKey),
    onConnect: jest.fn().mockImplementation((callback) => {
      callback(false)
      return () => {}
    }),
    onSecureChannelEstablished: jest.fn().mockImplementation((callback) => {
      callback()
      return () => {}
    }),
    onSecureMessage: jest.fn().mockImplementation((callback) => {
      return () => {}
    }),
    connection: {
      connectionString: "wss://bridge.zkpassport.localhost",
      getBridgeId: jest.fn().mockReturnValue("test-topic-123"),
      isConnected: jest.fn().mockReturnValue(true),
      keyPair: {
        publicKey: mockPublicKey,
        privateKey: new Uint8Array(32),
      },
    },
  }

  const MockBridge = jest.fn().mockImplementation(() => mockBridgeInstance)

  // Add static create method
  MockBridge.create = jest.fn().mockImplementation(async ({ keyPair, bridgeId } = {}) => {
    if (keyPair) {
      mockBridgeInstance.connection.keyPair = keyPair
    }
    if (bridgeId) {
      mockBridgeInstance.connection.getBridgeId = jest.fn().mockReturnValue(bridgeId)
    }
    return mockBridgeInstance
  })

  return {
    Bridge: MockBridge,
    BridgeInterface: jest.fn(),
  }
})

// Fallback for environments without WebSocket
global.WebSocket = WebSocket
