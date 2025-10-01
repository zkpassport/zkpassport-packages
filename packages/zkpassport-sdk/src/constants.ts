export const VERSION = "0.9.0"
export const DEFAULT_VALIDITY = 7 * 24 * 60 * 60 // 7 days
export const DEFAULT_DATE_VALUE = new Date(0)

// This is the app id hash for the ZKPassport app
// i.e. hash of `YL5MS3Z639.app.zkpassport.zkpassport`
export const ZKPASSPORT_IOS_APP_ID_HASH =
  "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b"

export const ZKPASSPORT_ANDROID_APP_ID_HASH =
  "0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615d"

// This is the hash of the root key of Apple's App Attest
export const APPLE_APP_ATTEST_ROOT_KEY_HASH =
  "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b"

// This is the hash of the RSA root key of Google's App Attest
// Google will roll out an ECDSA P384 root key in February 2026
export const GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH =
  "0x16700a2d9168a194fc85f237af5829b5a2be05b8ae8ac4879ada34cf54a9c211"
