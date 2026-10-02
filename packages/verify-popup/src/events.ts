import type { PopupEventMessage } from "@zkpassport/sdk/popup"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** What a flow reports back to the relying party; the transport adds the marker. */
export type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">
