import { bytesToHex } from '@noble/ciphers/utils'
import { getSharedSecret } from '../../src/encryption'
import { MockWebSocket } from './MockWebSocket'
import { createEncryptedJsonRpcRequest } from '../../src/json-rpc'

export async function waitForCallback(callback: (resolve: () => void) => void): Promise<void> {
  return new Promise<void>((resolve) => {
    callback(resolve)
  })
}

export async function simulateHelloFromFrontend(
  wsClient: MockWebSocket,
  keyPairFrontend: any,
  keyPairMobile: any,
  TOPIC: string,
) {
  const sharedSecret = await getSharedSecret(
    bytesToHex(keyPairFrontend.privateKey),
    bytesToHex(keyPairMobile.publicKey),
  )
  const encryptedMessage = await createEncryptedJsonRpcRequest('hello', null, sharedSecret, TOPIC)
  encryptedMessage['origin'] = 'https://localhost'
  console.debug('Simulating sending encrypted message:', encryptedMessage)
  wsClient.onmessageHandlers?.forEach((callback) => callback({ data: JSON.stringify(encryptedMessage) }))
}

export async function simulateHandshakeFromMobile(wsClient: MockWebSocket, publicKey: Uint8Array) {
  const message = { method: 'handshake', params: { pubkey: bytesToHex(publicKey) }, origin: 'https://localhost' }
  wsClient.onmessageHandlers?.forEach((callback) => callback({ data: JSON.stringify(message) }))
}
