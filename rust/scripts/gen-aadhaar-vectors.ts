// Generates the Aadhaar differential test vectors from the TypeScript oracle
// (@zkpassport/utils) for rust/crates/zkpassport-core.
//
//   cd packages/zkpassport-utils && bun ../../rust/scripts/gen-aadhaar-vectors.ts
//
// Output: rust/vectors/aadhaar.json (consumed by tests/differential.rs)

import { createPrivateKey, createPublicKey, createSign } from "node:crypto"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  aadhaarToPassportViewModel,
  buildAadhaarSignedData,
  calculateAadhaarCommitment,
  getAadhaarCircuitInputs,
  getAadhaarPhotoHash,
  parseAadhaarData,
} from "../../packages/zkpassport-utils/src/circuits/aadhaar"
import { getNumberOfPublicInputs } from "../../packages/zkpassport-utils/src/circuits"
import {
  getAgeCircuitInputs,
  getServiceScopeHash,
} from "../../packages/zkpassport-utils/src/circuit-matcher"
import {
  getAadhaarOuterCircuitInputs,
  getAadhaarOuterCircuitName,
} from "../../packages/zkpassport-utils/src/recursion"
import {
  createPackagedCertificatesFile,
  PACKAGED_CERT_TYPE_UIDAI,
} from "../../packages/zkpassport-utils/src/registry"

const BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

// Deterministic bytes (LCG) so vectors are reproducible
function lcgBytes(seed: number, len: number): number[] {
  let s = seed >>> 0
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    out.push((s >>> 16) & 0xff)
  }
  return out
}

function ocp(pis: string[], tag: string) {
  return {
    proof: [`0x${tag}1`],
    publicInputs: pis,
    vkey: [`0x${tag}2`],
    keyHash: `0x${tag}3`,
    treeHashPath: [`0x${tag}4`, `0x${tag}5`],
    treeIndex: `0x${tag}6`,
  }
}

// A throwaway key: the certificates file below lists it as a UIDAI key
const AADHAAR_TEST_KEY = createPrivateKey(`-----BEGIN PRIVATE KEY-----
MIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDUvf1fOehl5E07
MytVS8I90/y4uPVWJw9PbkdLy1YWi9qaVpom2TH2wJkyNOS+FJ3Eh9GndHk5O0df
4lRQiwfnl+jKbZVG1rDXzA0Q+xHfPLm/1DllS3CTgMCLkBglOlTwth0qA2jycBNp
SksthpEmTUMusdJwgIyxN9y8Qb64PrzmLmEQcmM88egQjuzItiZz2XxNInDRFnms
m/q5LVYFjEj5avg88SSMa4Rz/teoDChwYg+yz/IRgmwtoSr5fjnzKQ962bGbTSp7
hCQ1TLdgLmcLKbAw/yZJVEhuHfm2i3ES4Tpsz8VL9rzuNuLy/2kt2HksH3ewedIV
Q5lc+3NZAgMBAAECggEABrDsD2rtl4jQ8gf3uLDPjOzGMdQlaT6EwYGNLgHY9RAU
gc6v/gFOTD2+A8F8oUraNHR2IF9uMaHe6pHeh4L77mmNeZJtQ8NcYAkrrwlKhFwv
Vmx5Gqm/AnCl/a28SK13PvPnYmsliZyDS8g5qZamKY98CbOvk/jDFA7W+zfRJQ/L
ZkGyrlK9wnqUqV7y6xJq4S+qY+lbUG6rS0oJn4uHTcdOvgQ6aM02fa5MK5hp9q4V
IO+QsqgXOjeiwrdTXLCEuJQo8d9I75XZXIOB1d1WLsvWFFo4CBavZdPWozRVyhPp
gHJs2J+VEGgGyJGZYDDTq7fNIZ0RS0KfCbMPqEX+1QKBgQDxuoHJ/q+B2pYMsOkC
IQwNsWAKLINsEM7EeEzwV5hAXrrUcdzKYucuGSATvwn2BA34UMR1m+WQtBMXLGRO
XZawmf8rmgmMtRDnfwm9GfKEiBo0qdv5MUsNFkeijM3A/Je9JY/JRtQ0J/nlBAcj
g9eKiVBnxzQWhBVaw9E0+/jI9QKBgQDhTWGlMbB9MUJJOz6sZhvtxlmUdUrg4m+r
xURW6DFHyfOzJXmSWqESz7kfzmAWMfGbFd+InMN1iimhJ9olmoWmVgregLAARwrO
maJR0rUC6zPp028jWmbxbIXmLXL/U85vG87ILEtm6kmC3AL7WqNeh0lmA35gqr3p
odoNRpGSVQKBgQC0nHzzNxddd7wbWWePzq9Z38j5cQ71BI3pYFVkUp6QofcIWtb0
ZPeEiwNbnabMqXTirz5K/aOF/fYxn1qG7whzhWyR4HL4LiWmQlY9c5Cvk5248Z1J
UJpZ+eamPnxRkKmzisgnRIOzQJdHlT3cPFskyLpKAB4cIK5v9dVvuEDHrQKBgQCe
7q5eEQJWHiSLck6Q4Or8vbo9fsxWfYWXH25I/DyfTrgp/NqYwnPzyDLoW/XuUkcE
RtbMEQHU7aTWOT2q3yk+oF3EffUqDPNzsG8P11q3d2HEpdE1mDUcQ5jlOdRwhxcN
zAj/rjd2nvlCZZ943oR2T2sYmohQ+sFDiVg/mzNfjQKBgQC+XzvknvJ08gk2LrtD
9vf2sRKp/GBTw1Ja/7VUFxiqe/CH/9MvYjA+eSmvxQgTtr8s/jNcb6U/86Cf9WCV
I+y52ES1svCLpCE3x/rTXHS1hY6XMDImyWwNaIU91KRJB1C+VWvzajBYwY4kIems
cyGHPPyv9CQMwBulRKmX8fBfQA==
-----END PRIVATE KEY-----`)
const aadhaarModulus = Buffer.from(
  createPublicKey(AADHAAR_TEST_KEY).export({ format: "jwk" }).n!,
  "base64url",
).toString("hex")
const aadhaarCert = (modulus: string, extra: object) => ({
  country: "IND",
  signature_algorithm: "RSA",
  public_key: { type: "RSA", modulus: `0x${modulus}`, exponent: 65537, key_size: 2048 },
  validity: { not_before: 1770112572, not_after: 1864634916 },
  fingerprint: `0x${"11".repeat(31)}`,
  ...extra,
})
const aadhaarCerts = await createPackagedCertificatesFile({
  timestamp: 1777479919,
  certificates: [
    aadhaarCert("c5".repeat(256), { fingerprint: `0x${"22".repeat(31)}`, tags: ["UN"] }),
    aadhaarCert(aadhaarModulus, { type: PACKAGED_CERT_TYPE_UIDAI, tags: ["IN"] }),
  ] as any,
  masterlists: [],
})
const aadhaarPhoto = new Uint8Array([0xff, 0x4f, 0xff, 0x51, ...lcgBytes(90, 700)])
const aadhaarV2 = buildAadhaarSignedData(
  {
    aadhaarLastDigits: "1234",
    signedAt: "20260315123045678",
    name: "Rahul Kumar-Sharma, Jr",
    dateOfBirth: "15-08-1990",
    gender: "M",
    mobileLastDigits: "5678",
  },
  aadhaarPhoto,
)
// V1 has no version field or mobile digits, and ends with the hashes its indicator names
const aadhaarV1 = new Uint8Array([
  ...new TextEncoder().encode("3"),
  255,
  ...aadhaarV2.subarray(5, aadhaarV2.length - aadhaarPhoto.length - 5),
  ...aadhaarPhoto,
  ...lcgBytes(91, 64),
])
const aadhaarSalts = { dg1Salt: 3n, expiryDateSalt: 5n, dg2HashSalt: BN254_P + 7n, privateNullifierSalt: 11n }
const cases = []
for (const [label, signedData] of [
  ["v2", aadhaarV2],
  ["v1", aadhaarV1],
] as const) {
  const signature = new Uint8Array(createSign("SHA256").update(signedData).sign(AADHAAR_TEST_KEY))
  const qr = { signedData, signature }
  const passport = aadhaarToPassportViewModel(qr, aadhaarModulus)
  const parsed = parseAadhaarData(signedData)
  const { commitment, privateNullifier } = await calculateAadhaarCommitment(aadhaarSalts, parsed)
  cases.push({
    label,
    signed_data: Buffer.from(signedData).toString("base64"),
    signature: Buffer.from(signature).toString("base64"),
    certs: aadhaarCerts,
    mrz: passport.mrz,
    photo_hash: Array.from(getAadhaarPhotoHash(parsed)),
    private_nullifier: privateNullifier.toString(),
    commitment: commitment.toString(),
    inputs: await getAadhaarCircuitInputs(passport, aadhaarSalts, aadhaarCerts),
    age: await getAgeCircuitInputs(
      passport,
      { age: { gte: 18 } },
      aadhaarSalts,
      0n,
      getServiceScopeHash("demo.zkpassport.id"),
      0n,
      1789000000,
    ),
  })
}
const disc1 = ocp(["0xd0", "0x64", "0xd2", "0xd3", "0xd4", "0xd5", "0x99", "0xd7"], "d")
const disc2 = ocp(["0xe0", "0x64", "0xe2", "0xe3", "0xe4", "0xe5", "0x0", "0xe7"], "e")
const aadhaarId = ocp(["0xf0", "0xf1", "0x65"], "f")
const aadhaarOuterInputs = {
  circuit_root: "0xabc123",
  name: getAadhaarOuterCircuitName(2, { evm: true }),
  result: getAadhaarOuterCircuitInputs(aadhaarId, [disc1, disc2], "0xabc123"),
}


const numPub = ["aadhaar_id", "outer_aadhaar_count_3", "outer_evm_aadhaar_count_11"].map((name) => ({
  name,
  count: getNumberOfPublicInputs(name, "0.23.0"),
}))

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "vectors", "aadhaar.json")
writeFileSync(out, JSON.stringify({ cases, outer: aadhaarOuterInputs, numPub }, null, 1))
console.log(`wrote ${cases.length} cases → rust/vectors/aadhaar.json`)
