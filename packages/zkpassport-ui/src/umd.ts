// IIFE entry. Bundled and exposed as `window.ZKPassportUI` for <script>-tag consumers.
// Contains only the vanilla API — React is not bundled here.

export { mount } from "./vanilla/mount"
export type {
  QRCardError,
  QRCardHandle,
  QRCardOptions,
  QRCardState,
  QRCardSuccessResponse,
  ZKPassportRequestLike,
} from "./core/types"
