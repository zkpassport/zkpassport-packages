export { mockWebSocket, MockWebSocket } from "./mock-websocket"

export const waitForCallback = <T = any>(
  callback: (resolve: (value?: T) => void) => void,
): Promise<T> => {
  return new Promise<T>((resolve) => callback(resolve as (value?: T) => void))
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
