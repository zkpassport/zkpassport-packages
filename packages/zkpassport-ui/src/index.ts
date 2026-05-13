// The `"use client"` directive is injected post-build by tsup's onSuccess hook
// (see tsup.config.ts). esbuild strips module-level directives during bundling,
// so we put it in the source for editor/IDE accuracy but rely on the post-build
// prepend for the published file.

export { QRCard, type QRCardProps } from "./react/QRCard"
export {
  useZKPassportRequest,
  type UseZKPassportRequestOptions,
  type ZKPassportLike,
} from "./react/use-request"

// Also re-export the vanilla mount + all types so React consumers can drop
// down to the imperative API when they need to.
export { mount } from "./vanilla/mount"
export type {
  QRCardError,
  QRCardHandle,
  QRCardOptions,
  QRCardState,
  QRCardSuccessResponse,
  ZKPassportRequestLike,
} from "./core/types"
