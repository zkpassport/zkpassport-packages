// PR 1 stub. The full state machine — including event subscriptions to a
// ZKPassportRequestLike and the preparing/connecting/waiting/scanned/generating/success/error
// transitions described in the design doc — lands in PR 2.

import type { QRCardOptions, QRCardState } from "./types"

export function initialState(options: QRCardOptions): QRCardState {
  return options.request === null ? "preparing" : "connecting"
}
