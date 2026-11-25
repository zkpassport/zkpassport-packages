import type { BridgeInterface } from "@obsidion/bridge"

type ConnectingBridge = {
  isBridgeConnected: BridgeInterface["isBridgeConnected"]
  onConnect: (callback: () => void) => () => void
  onFailedToConnect: (callback: () => void) => () => void
}

/**
 * Waits for the bridge connection to open.
 * @returns Whether it opened; false when the bridge could not be reached or the wait timed out.
 */
export function waitForBridgeConnection(
  bridge: ConnectingBridge,
  timeoutMs: number,
): Promise<boolean> {
  if (bridge.isBridgeConnected()) return Promise.resolve(true)
  return new Promise((resolve) => {
    const settle = (connected: boolean) => {
      clearTimeout(timer)
      unsubscribe.forEach((stop) => stop())
      resolve(connected)
    }
    const timer = setTimeout(() => settle(false), timeoutMs)
    const unsubscribe = [
      bridge.onConnect(() => settle(true)),
      bridge.onFailedToConnect(() => settle(false)),
    ]
  })
}
