/* eslint-disable @typescript-eslint/no-explicit-any */

export { mockWebSocket, MockWebSocket } from "./mock-websocket"

export const waitForCallback = <T = any>(
  callback: (resolve: (value?: T) => void) => void,
): Promise<T> => {
  return new Promise<T>((resolve) => callback(resolve as (value?: T) => void))
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The hex of a fake outer proof whose public inputs commit to `circuitRoot` */
export function fakeOuterProofCommittingTo(circuitRoot: string): string {
  const fields = Array.from({ length: 20 }, () => "00".repeat(32))
  fields[1] = circuitRoot.slice(2).padStart(64, "0")
  return fields.join("")
}
