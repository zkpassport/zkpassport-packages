# Browser Verification (Saved IDs): Security & Privacy Overview

Reviewer-oriented summary of how in-browser re-verification works, what is stored, and the trust model. Audience: engineering, legal, op-sec.

## What it is

- After a normal first verification with the ZKPassport mobile app, the user can choose to save their ID in the browser. Later verifications then run entirely in the browser: no phone, no app, no re-scan.
- The browser does not store the physical document or its raw chip files. It stores the three base ZK proofs plus the minimal witness data needed to generate future disclosure proofs locally.
- Feature is opt-in three times over: the relying party (RP) must enable it, the user must consent on the phone, and the user must explicitly save in the browser.

## Where it runs

- All saving/proving happens in a popup on `verify.zkpassport.id` (a ZKPassport-controlled origin), opened by a button the RP embeds. Saved IDs therefore work across all RPs but live in one place.
- The RP page never sees ID data. It only receives the final ZK proofs and the disclosed results, exactly as in the phone flow.
- The popup identifies the RP by the browser-attested `postMessage` origin, never by self-declared values. The mobile app trusts `verify.zkpassport.id` by exact-hostname allowlist, using the bridge server-attested WebSocket `Origin` header.

## How enrollment works (first verification)

1. User verifies normally: phone reads the passport/ID chip and generates all proofs.
2. If the RP opted in and the browser supports the required WebAuthn features, the phone shows an explicit consent sheet (auto-declines after 60 seconds).
3. On consent, the phone sends an "enrollment bundle" to the browser over the same end-to-end encrypted bridge used for proofs.
4. The browser offers to save. On accept, it creates a passkey and stores the bundle encrypted (details below). If the authenticator does not support the PRF extension, nothing is stored.

## What exactly is stored in the browser

Encrypted (AES-256-GCM ciphertext in IndexedDB on the verify origin):

- The three base ZK proofs (document signature checks and data integrity; not tied to any RP).
- Disclosure witness: DG1 (the MRZ bytes: name, document number, date of birth, expiry, nationality), hash of DG2, expiry date, the private nullifier, and the commitment salt.

Plaintext metadata (readable without a passkey, deliberately minimal):

- Masked holder name, initials only (e.g. "J*** S***"), for the picker UI.
- A per-document identifier (SHA-256 of the private nullifier), creation timestamp, circuit version, certificate registry root (used for staleness checks), WebAuthn credential ID, and the random salts/IV.

In the platform authenticator (iCloud Keychain / Google Password Manager): one passkey per saved document. It contains key material only, no personal data beyond the masked name used as the passkey label.

## Encryption

- Key source: WebAuthn passkey PRF extension. The PRF secret is only released by the authenticator after user verification (Face ID / Touch ID / device PIN), with `userVerification: "required"`.
- Derivation: PRF output (with a random 32-byte PRF salt) -> HKDF-SHA256 (random 32-byte salt, fixed info string) -> AES-256-GCM key.
- Encryption: AES-256-GCM, fresh random 96-bit IV per encryption, AAD bound to the storage domain.
- The AES key is derived on demand and never persisted. The ciphertext alone (e.g. from a stolen disk image or synced browser profile) is useless without the passkey ceremony.
- Browsers without passkey/PRF support never get the save offer, and the QR request never asks the phone for a bundle.

## Does personal data leave the user's device?

- Phone -> browser: the enrollment bundle travels once, over the end-to-end encrypted bridge (keys established via the QR handshake). The relay server forwards ciphertext only; it can observe connection metadata (origins, IPs, timing) but not contents.
- ZKPassport servers: never receive the bundle, the witness, or any decrypted personal data. There is no server-side copy and nothing to breach centrally.
- RP: receives ZK proofs and only the attributes/predicates the user agreed to disclose. Unique identifiers are per-service scoped nullifiers, so RPs cannot link a user across services.
- Network fetches during browser proving (circuit manifests, circuit artifacts, registry root checks, CRS) are public artifacts; requests contain no personal data.

## Each reuse (subsequent verifications)

- The popup lists saved IDs (masked names). Selecting one requires a fresh passkey ceremony with user verification; only then is the bundle decrypted, in memory, in the popup.
- The browser generates the RP-specific disclosure proofs locally (Noir/Barretenberg WASM) and chains them to the stored base proofs. Verification of the result is identical to the phone flow.
- Before proving, the SDK checks the on-chain circuit and certificate registry roots. If they have rotated, the enrollment is treated as stale, deleted, and the user falls back to the phone flow.

## Trust assumptions

- The `verify.zkpassport.id` origin and its deployment pipeline. Code served there handles plaintext at unlock time. This is the primary trust anchor.
- The user's browser and OS are not compromised (malware or a malicious extension with page access could read data at the moment of unlock; same class of risk as any in-browser cryptography, including password managers).
- The platform authenticator / passkey sync fabric (Apple, Google) protects the PRF secret.
- The bridge relay is untrusted for confidentiality (E2E encryption) but trusted for availability; it also attests the browser peer's origin to the phone.
- Standard ZK assumptions of the existing proof system (unchanged by this feature).

## How could this be compromised?

- Compromise of the verify origin (supply chain, XSS, hostile deploy): malicious JS could exfiltrate a bundle, but only after the user actively unlocks with their passkey; nothing can be decrypted silently in the background. Mitigations: no third-party scripts on the page, single-purpose static app, exact-origin allowlisting in the mobile app.
- Malware or a rogue browser extension on the user's machine: can capture plaintext at unlock time. Not defendable by any web app; scoped to that one user.
- Attacker with the user's device, able to pass user verification (coerced biometric / known PIN): can unlock, same exposure as the phone app itself.
- Attacker with both the user's synced passkey vault and a copy of that browser's IndexedDB: could decrypt offline. Requires two independent compromises (cloud account and device storage).
- Lookalike domains or a malicious RP page: cannot access storage (bound to the exact verify origin), cannot spoof the RP identity to the phone (origin is browser/relay-attested, exact-host matched), and cannot read anything from the popup beyond the final result messages.
- What this feature does not change: a user can still consent to disclosing attributes to a dishonest RP; that risk is identical to the phone flow and bounded by what the query discloses.

## User control & data lifecycle

- Save is optional per document; declining costs nothing.
- Each saved ID can be deleted in the popup (with confirmation). Clearing browser site data for the verify origin also destroys the ciphertext; the leftover passkey alone contains no personal data.
- Stale enrollments (rotated registry roots, outdated circuit versions) are deleted automatically and cannot be used.
- No server-side records exist for this feature, so there is nothing to delete or disclose on ZKPassport infrastructure.

## Current scope / limitations (v1)

- Non-salted (standard) verification mode only; salted-nullifier and facematch requests always fall back to the phone.
- Multithreaded proving is enabled only where the browser supports Document-Isolation-Policy (Chromium); other browsers prove single-threaded.
- Saved IDs are per browser profile (and sync only if the browser syncs IndexedDB, which mainstream browsers do not); the passkey may sync, but without the local ciphertext it unlocks nothing.
