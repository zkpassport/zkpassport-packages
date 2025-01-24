import { randomBytes } from "crypto"
import type { JsonRpcRequest, JsonRpcResponse } from "@zkpassport/utils"
import { encrypt } from "./encryption"
import { WebSocketClient } from "./websocket"
import { noLogger as logger } from "./logger"

export function createJsonRpcRequest(method: string, params: any): JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: randomBytes(16).toString("hex"),
    method,
    params,
  }
}

export async function createEncryptedJsonRpcRequest(
  method: string,
  params: any,
  sharedSecret: Uint8Array,
  topic: string,
): Promise<JsonRpcRequest> {
  const encryptedMessage = await encrypt(
    JSON.stringify({ method, params: params || {} }),
    sharedSecret,
    topic,
  )
  return createJsonRpcRequest("encryptedMessage", {
    payload: Buffer.from(encryptedMessage).toString("base64"),
  })
}

export async function sendEncryptedJsonRpcRequest(
  method: string,
  params: any,
  sharedSecret: Uint8Array,
  topic: string,
  wsClient: WebSocketClient,
): Promise<boolean> {
  try {
    const message = { method, params: params || {} }
    const encryptedMessage = await encrypt(JSON.stringify(message), sharedSecret, topic)
    const request = createJsonRpcRequest("encryptedMessage", {
      payload: Buffer.from(encryptedMessage).toString("base64"),
    })
    logger.debug("Sending encrypted message (original):", message)
    logger.debug("Sending encrypted message (encrypted):", request)
    wsClient.send(JSON.stringify(request))
    return true
  } catch (error) {
    logger.error("Error sending encrypted message:", error)
    return false
  }
}

export function createJsonRpcResponse(id: string, result: any): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  }
}
