import { IDCredential, IDCredentialConfig, IDCredentialValue, NumericalIDCredential } from './types/credentials'
import { bytesToHex } from '@noble/ciphers/utils'
import { getWebSocketClient, WebSocketClient } from './websocket'
import { sendEncryptedJsonRpcRequest } from './json-rpc'
import { decrypt, generateECDHKeyPair, getSharedSecret } from './encryption'
import { JsonRpcRequest } from './types/json-rpc'
import logger from './logger'

export class zkPassportScanner {
  private domain?: string
  private topicToKeyPair: Record<string, { privateKey: Uint8Array; publicKey: Uint8Array }> = {}
  private topicToWebSocketClient: Record<string, WebSocketClient> = {}
  private topicToSharedSecret: Record<string, Uint8Array> = {}
  private topicToRemotePublicKey: Record<string, Uint8Array> = {}

  private onWebsiteDomainVerifySuccessCallbacks: Array<() => void> = []
  private onWebsiteDomainVerifyFailureCallbacks: Array<() => void> = []

  constructor() {}

  /**
   * @notice Handle an encrypted message.
   * @param request The request.
   * @param outerRequest The outer request.
   */
  private async handleEncryptedMessage(topic: string, request: JsonRpcRequest, outerRequest: JsonRpcRequest) {
    logger.debug('Received encrypted message:', request)
    if (request.method === 'hello') {
      logger.info(`Successfully verified origin domain name: ${outerRequest.origin}`)
      await Promise.all(this.onWebsiteDomainVerifySuccessCallbacks.map((callback) => callback()))
    } else if (request.method === 'closed_page') {
      // TODO: Implement
    }
  }

  /**
   * @notice Scan a credentirequest QR code.
   * @returns
   */
  public async scan(
    url: string,
    {
      keyPairOverride,
    }: {
      keyPairOverride?: { privateKey: Uint8Array; publicKey: Uint8Array }
    } = {},
  ) {
    const parsedUrl = new URL(url)
    const domain = parsedUrl.searchParams.get('d')
    const topic = parsedUrl.searchParams.get('t')
    const pubkeyHex = parsedUrl.searchParams.get('p')

    if (!domain || !topic || !pubkeyHex) {
      throw new Error('Invalid URL: missing required parameters')
    }

    const pubkey = new Uint8Array(Buffer.from(pubkeyHex, 'hex'))

    this.domain = domain
    const keyPair = keyPairOverride || (await generateECDHKeyPair())

    this.topicToKeyPair[topic] = {
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    }
    // this.topicToConfig[topic] = {}
    this.topicToRemotePublicKey[topic] = pubkey
    this.topicToSharedSecret[topic] = await getSharedSecret(bytesToHex(keyPair.privateKey), bytesToHex(pubkey))

    // Set up WebSocket connection
    const wsClient = getWebSocketClient(
      `wss://bridge.zkpassport.id?topic=${topic}&pubkey=${bytesToHex(keyPair.publicKey)}`,
    )
    this.topicToWebSocketClient[topic] = wsClient

    wsClient.onopen = () => {
      logger.info('WebSocket connection established')
      // Server sends handshake automatically (when it sees a pubkey in websocket URI)
      // wsClient.send(
      //   JSON.stringify(
      //     createJsonRpcRequest('handshake', {
      //       pubkey: bytesToHex(keyPair.publicKey),
      //     }),
      //   ),
      // )
    }

    wsClient.addEventListener('message', async (event: any) => {
      logger.info('Received message:', event.data)

      try {
        const data: JsonRpcRequest = JSON.parse(event.data)
        const originDomain = data.origin ? new URL(data.origin).hostname : undefined
        // Origin domain must match domain in QR code
        if (originDomain !== this.domain) {
          logger.warn(`Origin does not match domain in QR code. Expected ${this.domain} but got ${originDomain}`)
          return
        }

        if (data.method === 'encryptedMessage') {
          // Decode the payload from base64 to Uint8Array
          const payload = new Uint8Array(
            atob(data.params.payload)
              .split('')
              .map((c) => c.charCodeAt(0)),
          )
          try {
            // Decrypt the payload using the shared secret
            const decrypted = await decrypt(payload, this.topicToSharedSecret[topic], topic)
            const decryptedJson: JsonRpcRequest = JSON.parse(decrypted)
            await this.handleEncryptedMessage(topic, decryptedJson, data)
          } catch (error) {
            logger.error('Error decrypting message:', error)
          }
        }
      } catch (error) {
        logger.error('Error:', error)
      }
    })

    wsClient.onerror = (error: Event) => {
      logger.error('WebSocket error:', error)
    }

    return {
      domain: this.domain,
      requestId: topic,
      onWebsiteDomainVerified: (callback: () => void) => this.onWebsiteDomainVerifySuccessCallbacks.push(callback),
      notifyReject: async () => {
        await sendEncryptedJsonRpcRequest(
          'reject',
          null,
          this.topicToSharedSecret[topic],
          topic,
          this.topicToWebSocketClient[topic],
        )
      },
      notifyAccept: async () => {
        await sendEncryptedJsonRpcRequest(
          'accept',
          null,
          this.topicToSharedSecret[topic],
          topic,
          this.topicToWebSocketClient[topic],
        )
      },
      notifyDone: async (proof: string) => {
        await sendEncryptedJsonRpcRequest(
          'done',
          { proof },
          this.topicToSharedSecret[topic],
          topic,
          this.topicToWebSocketClient[topic],
        )
      },
      notifyError: async (error: string) => {
        await sendEncryptedJsonRpcRequest(
          'error',
          { error },
          this.topicToSharedSecret[topic],
          topic,
          this.topicToWebSocketClient[topic],
        )
      },
    }
  }
}

const zkPassport = new zkPassportScanner()

/*want to check "TUR" is not in the list

find some j where countries[j] < TUR < countries[j+1]

With each letter converted to its ASCII value and the three letters forming a 24 bit number.

Example:
TUR -> 84 117 114
*/

async function main() {
  const scannedUrl =
    'https://zkpassport.id/r?d=demo.zkpassport.id&t=abc456&p=02d3ff5e5db7c48c34880bc11e8b457a4b9a6bf2a2f545cf575eb941b08f04adc4'

  const { onWebsiteDomainVerified, notifyAccept, notifyReject, notifyDone } = await zkPassport.scan(scannedUrl, {
    keyPairOverride: {
      privateKey: new Uint8Array([
        90, 246, 191, 146, 154, 179, 181, 226, 245, 114, 8, 4, 190, 198, 230, 242, 30, 43, 221, 195, 89, 211, 59, 55,
        174, 189, 59, 205, 197, 94, 216, 14,
      ]),
      publicKey: new Uint8Array([
        3, 202, 45, 95, 176, 97, 188, 130, 46, 26, 69, 197, 152, 237, 220, 8, 6, 156, 55, 254, 254, 9, 96, 71, 169, 10,
        127, 249, 203, 125, 180, 136, 170,
      ]),
    },
  })

  // Once the domain is verified, the accept button can be enabled, allowing the user to generate a proof
  onWebsiteDomainVerified(async () => {
    logger.info('Website domain verified!')
    notifyAccept()
    await sleep(1000)
    notifyDone('proof')
    // notifyReject()
  })
}

main()

// Utility function to sleep for a specified duration
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
