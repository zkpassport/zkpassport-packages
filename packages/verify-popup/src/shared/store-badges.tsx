import {
  APP_STORE_URL,
  copyRequestForInstall,
  detectMobileOs,
  playStoreUrlWithReferrer,
} from "@zkpassport/ui/app-link"

/** The store page for this phone, or null where it is not a phone the app runs on. */
export function storeUrlFor(requestUrl: string | null): string | null {
  const os = detectMobileOs()
  if (os === "ios") return APP_STORE_URL
  if (os === "android") return playStoreUrlWithReferrer(requestUrl)
  return null
}

/** Store links for the ZKPassport app, narrowed to the platform the visitor is on. */
export function StoreBadges({ requestUrl }: { requestUrl: string | null }) {
  const os = detectMobileOs()

  return (
    <div className="store-badges">
      {os !== "android" ? (
        <a
          className="store-badge"
          href={APP_STORE_URL}
          target="_blank"
          rel="noreferrer"
          onClick={() => copyRequestForInstall(requestUrl)}
        >
          <img src="/app-store-badge.svg" alt="Download on the App Store" width={144} height={48} />
        </a>
      ) : null}
      {os !== "ios" ? (
        <a
          className="store-badge"
          href={playStoreUrlWithReferrer(requestUrl)}
          target="_blank"
          rel="noreferrer"
        >
          <img src="/play-store-badge.svg" alt="Get it on Google Play" width={162} height={48} />
        </a>
      ) : null}
    </div>
  )
}
