# Expanding ZKPassport Coverage Beyond Passports

## Goal
Cover non-passport holders via **signed national credentials** verifiable against a published key (registry). Reuse existing circuits/registry wherever possible.

## Decision (updated)
- **Commit to the signed-credential (registry) model.** A credential qualifies if the issuer publishes a verification key/root and the crypto is supported → verify offline, prove in ZK. Same trust root as a passport chip (tier A).
- **Do NOT build zkTLS.** Rationale: for the big closed-ID countries (China, Pakistan, Egypt, Iran…) zkTLS is *least* likely to work (bot-protection, app-attestation on portals, ToS, brittle parsing) **and** only ever buys weaker tier-B trust (notary/attestor non-collusion + WebPKI). Poor ROI on the hardest targets, adds a trust assumption we don't want. Replaced by a **watchlist** for those countries' emerging open credentials.
- **AI-doc + face-match + App Attest = the universal floor (tier C)** for everyone without a signed credential.

## Registry compatibility (unchanged core)
- Leaf = `PackagedCertificate { country, signature_algorithm (RSA|RSA-PSS|ECDSA), public_key, validity, tags, type }` — `zkpassport-utils/src/types/registry.ts`.
- Poseidon2 Merkle tree + separate **revocation** tree + separate **masterlist** tree, all under one root on `RootRegistry`.
- New credentials absorbed via new `type` values.
- **CRITICAL:** circuit must bind leaf `type` into the membership proof (a UIDAI key must never satisfy a CSCA check, and vice versa).
- **Only new crypto primitive needed = Ed25519 (PhilID).** Everything else reuses RSA-2048/4096, ECDSA P-256, X.509 chain verify, mDoc/COSE, JWKS/DID snapshots.
- Population figures are **directional sizing**, not verified.

## "Signed-data check" — how to qualify any country for Lane 1
1. Can the user obtain a **signed artifact** (JWS / signed XML / PDF-with-detached-sig / mDoc / VC)?
2. Is the **signing cert/root publicly published** (not gated behind the gov's own online verify endpoint)?
3. Is the crypto **RSA / ECDSA / Ed25519** (GOST/SM2 = new primitive → hard)?

All three yes → Lane 1 (tier A). Otherwise → watchlist or tier-C floor.

Closed vs open: closed national-ID chips (Emirates ID chip, China resident ID, Pakistan CNIC, Turkey Kimlik) keep signing keys private and verify only server-side → fail step 2 → not registry-viable. The blocker is a *governance* choice, not crypto.

---

## Lane 1 — Signed-credential schemes (tier A)

Status key: ✅ ready (reuses existing) · 🟡 spike needed · 🔵 new primitive · 🟢 reference impl exists

| Scheme (country) | Sig / format | Key source | ~Coverage | Registry work | Status |
|---|---|---|---|---|---|
| **Aadhaar (IND)** | RSA-2048/SHA-256 | UIDAI public `.cer` | ~1.2B | New leaf type; **1-level** membership; no chain; **no revocation tree**. Entry points: QR **+ UIDAI-signed offline eKYC XML + DigiLocker** issued docs | ✅ simplest |
| **mDL ISO 18013-5 (US/CA/EU)** | ECDSA P-256, COSE/CBOR | AAMVA **VICAL** + per-jurisdiction IACAs | tens of M now, ~200M ceiling | IACA≈CSCA, DocSigner≈DSC, VICAL≈masterlist; add CBOR/COSE parse; revocation = IACA fp + DocSigner serial | ✅ (2-level chain) |
| **MOSIP (ETH/NGA/MAR/+)** | Ed25519 / RSA / ECDSA (varies) | did:web / JWKS (TLS-hosted, **no offline masterlist**) | ~150–300M | Snapshot JWKS as typed leaves; **preserve provenance** (URL/timestamp/TLS/notary); re-snapshot on cadence | 🟡 per-country suite |
| **PhilID (PHL)** | **Ed25519**, Base45/CBOR | Key embedded in `verify.philsys.gov.ph` JS (fragile) | ~50–80M | 1-level proof, but needs Ed25519 in schema **+ Noir circuit** | 🔵 only new primitive |
| **Brazil CIN/CNH (BRA)** | RSA, ICP-Brasil chain (**>2 levels possible**) | ICP-Brasil public repo | ~70–150M | Pin intermediate CAs as leaves OR extend chain depth | 🟡 unverified |
| **Mexico e.firma/FIEL (MEX)** | RSA-2048 X.509 | `AC Raíz SAT` (public) | tens of M (**taxpayer-skewed**) | Existing 2-level RSA chain (like JPKI/MOICA/CR). UX: file+password | ✅ no new crypto |
| **Mexico CURP biométrica (MEX)** | TBD (**QR + digital signature**; DOB/sex/nationality/photo) | RENAPO (channel TBD) | ~130M+ → near-universal (**mandatory**, SIM deadline Jul 2026) | Aadhaar/CIN-class 1-level | 🟡 confirm sig suite + encoding + key channel |
| **Vietnam CCCD (VNM)** | ICAO SOD (DG1/DG2/DG13) if confirmed | Vietnam **CSCA** (availability TBD) | ~60M | Reuses existing CSCA + DG circuits unchanged | 🟡 cert-sourcing |
| **Japan JPKI/My Number (JPN)** | RSA-2048/SHA-256 (Basic Four) | J-LIS hierarchy (public) | ~70–90M | Existing 2-level RSA chain | 🟢 MynaWallet ref; confirm attr↔cert binding |
| **Taiwan MOICA (TWN)** | RSA-2048 X.509 | MOICA root (public) | part of ~5–15M | Existing RSA chain | ✅ |
| **Taiwan Digital ID Wallet (TWN)** | ECDSA P-256 mDoc | IACA-style (TBD) | part of ~5–15M | Folds into mDL/IACA path | 🟡 dist channel TBD |
| **South Korea mobile ID/mDL (KOR)** | ECDSA P-256 mDoc OR DID/VC | IACA or JWKS (TBD) | ~10–20M | mDL/IACA OR JWKS-snapshot | 🟡 format spike |
| **Costa Rica Firma Digital (CRI)** | RSA-2048/4096 X.509 (cédula) | `CA Raíz Nacional` / BCCR (public) | ~2–4M | Existing RSA chain | 🟢 `zk-firma-digital` ref exists |
| **Estonia eID (EST)** | ECDSA | SK ID Solutions / state PKI | already partial | Existing ICAO national-ID lane; raise `id_card` 0.5→1.0 | ✅ hardening only |

Notes:
- **Mexico INE credential = NOT Lane 1** (server-side DB match only).
- mDoc/COSE + IACA investment generalizes across mDL, EUDI, Taiwan & Korea wallets.
- MOSIP/PhilID trust is weakest (TLS-hosted / JS-embedded keys) — represent provenance explicitly.

---

## Emerging open-credential watchlist (not integrable today)

Closed-ID / no published key today. Track and integrate into Lane 1 the moment they publish keys. Ranked by population.

Aadhaar-like signed+published credential? ❌ none / 🟡 emerging or partial hope / ⚠️ signed but hard crypto

| Country | ~Pop | Aadhaar-like today? | What to watch |
|---|---|---|---|
| **China** | ~1.41B | ❌ | CTID/RealDID (MPS-controlled, permissioned, SM2/SM3). Politically closed — low hope |
| **Indonesia** | ~283M | 🟡 | **IKD** digital-ID + BSrE/Peruri PKI → may expose signed VCs |
| **Pakistan** | ~250M | ❌ | NADRA closed; rumored NADRA digital wallet |
| **Bangladesh** | ~175M | ❌ | NID smartcard closed |
| **Russia** | ~144M | ⚠️ | Gosuslugi **GOST**-signed docs — new primitive + sanctions |
| **Egypt** | ~116M | ❌/🟡 | ITIDA e-signature PKI; no holder identity credential yet |
| **Iran** | ~90M | ❌ | Closed + sanctions — non-starter |
| **Turkey** | ~86M | 🟡 | **e-imza (Kamu SM)** user-held certs — Lane-1-able if root public. Best of the hard cases |
| **Thailand** | ~72M | ❌ | Thai ID chip closed (ThaID server-side) |
| **DR Congo / Myanmar** | ~106M / ~55M | ❌ | Weak infra / no scheme |
| **Kenya** | ~56M | 🟡 | **Maisha Namba** — potential Lane-1 |
| **Tanzania** | ~67M | 🟡 | NIDA (MOSIP-adjacent) — potential Lane-1 |
| **Colombia** | ~52M | 🟡 | Cédula digital (QR) |
| **Argentina** | ~46M | 🟡 | DNI digital / Mi Argentina |
| **Ukraine** | ~38M | 🟡 | **Diia** — most promising near-term flip |

Global tide is VC / mDoc / MOSIP — most of these will flip to Lane 1 over time; integrate as each opens.

---

## Coverage estimate
Denominator = adults with internet/device access (the real ceiling): **~4.5B** (~83% of adults, ~56% of world).

- **Now (Lane 1 only, all published-key schemes built):** ~2.3–2.5B adults ≈ **~50–55% of ceiling** (~30% of world). Carried by India (Aadhaar) + developed world (passports/mDL/EUDI/JPKI).
- **Growth:** rises as watchlist countries publish keys (Indonesia IKD, Turkey e-imza, Kenya/Tanzania/Colombia/Argentina/Ukraine, MOSIP spread). No notary trust ever enters the stack.
- (For reference: a zkTLS lane could have reached ~65–85% but at tier-B trust — explicitly rejected.)

---

## Needs exploration / spikes
- **Mexico CURP biométrica:** sig suite + QR encoding + RENAPO key-publication channel.
- **Brazil CIN:** payload structure + ICP-Brasil chain depth.
- **Vietnam CCCD:** confirm ICAO SOD + source CSCA.
- **South Korea:** mDoc vs DID/VC format + key distribution.
- **MOSIP:** per-country signature suite + issuer endpoints.
- **PhilID:** ask PSA for stable key channel (vs scraping JS); implement Ed25519.
- **Signed-data check on watchlist:** UAE (UAE Pass PKI — request digital docs), Indonesia (IKD/BSrE), Turkey (e-imza/Kamu SM root) — nearest to Lane-1.
