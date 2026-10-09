import { APP_STORE_URL, detectMobileOs, playStoreUrlWithReferrer } from "@zkpassport/ui/app-link"

/** Store links for the ZKPassport app, narrowed to the platform the visitor is on. */
export function StoreBadges({ requestUrl }: { requestUrl: string | null }) {
  const os = detectMobileOs()

  return (
    <div className="store-badges">
      {os !== "android" ? (
        <a className="store-badge" href={APP_STORE_URL} target="_blank" rel="noreferrer">
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
