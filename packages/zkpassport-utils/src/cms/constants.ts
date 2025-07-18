import type { HashAlgorithm } from "../types"
import { p256 } from "@noble/curves/p256"
import { p384 } from "@noble/curves/p384"
import { p521 } from "@noble/curves/p521"

export const HASH_OIDS = {
  "1.3.14.3.2.26": "SHA-1",
  "2.16.840.1.101.3.4.2.1": "SHA-256",
  "2.16.840.1.101.3.4.2.2": "SHA-384",
  "2.16.840.1.101.3.4.2.3": "SHA-512",
  "2.16.840.1.101.3.4.2.4": "SHA-224",
}

export const CURVE_OIDS = {
  "1.2.840.10045.3.1.1": "P-192",
  "1.3.132.0.33": "P-224",
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.36.3.3.2.8.1.1.1": "brainpoolP160r1",
  "1.3.36.3.3.2.8.1.1.2": "brainpoolP160t1",
  "1.3.36.3.3.2.8.1.1.3": "brainpoolP192r1",
  "1.3.36.3.3.2.8.1.1.4": "brainpoolP192t1",
  "1.3.36.3.3.2.8.1.1.5": "brainpoolP224r1",
  "1.3.36.3.3.2.8.1.1.6": "brainpoolP224t1",
  "1.3.36.3.3.2.8.1.1.7": "brainpoolP256r1",
  "1.3.36.3.3.2.8.1.1.8": "brainpoolP256t1",
  "1.3.36.3.3.2.8.1.1.9": "brainpoolP320r1",
  "1.3.36.3.3.2.8.1.1.10": "brainpoolP320t1",
  "1.3.36.3.3.2.8.1.1.11": "brainpoolP384r1",
  "1.3.36.3.3.2.8.1.1.12": "brainpoolP384t1",
  "1.3.36.3.3.2.8.1.1.13": "brainpoolP512r1",
  "1.3.36.3.3.2.8.1.1.14": "brainpoolP512t1",
}

export const RSA_OIDS = {
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.113549.1.1.10": "rsassa-pss",
}

export const OIDS_TO_PUBKEY_TYPE: Record<string, string> = {
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.10045.2.1": "ecPublicKey",
}

export const OIDS_TO_SIG_ALGORITHM: Record<string, string> = {
  "1.2.840.113549.1.1.5": "sha1-with-rsa-signature",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.10": "rsassa-pss",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
}

// TODO: Consider merging with OIDS_TO_SIG_ALGORITHM
export const OIDS_TO_DESCRIPTION: Record<string, string> = {
  "1.2.840.113549.1.1.1": "rsaEncryption",
  "1.2.840.10045.2.1": "ecPublicKey",
  "1.2.840.113549.1.1.5": "sha1-with-rsa-signature",
  "1.2.840.113549.1.1.11": "sha256WithRSAEncryption",
  "1.2.840.113549.1.1.12": "sha384WithRSAEncryption",
  "1.2.840.113549.1.1.13": "sha512WithRSAEncryption",
  "1.2.840.113549.1.1.10": "rsassa-pss",
  "1.2.840.10045.4.1": "ecdsa-with-SHA1",
  "1.2.840.10045.4.3.2": "ecdsa-with-SHA256",
  "1.2.840.10045.4.3.3": "ecdsa-with-SHA384",
  "1.2.840.10045.4.3.4": "ecdsa-with-SHA512",
}

export const SIG_ALGORITHM_TO_HASH: Record<string, HashAlgorithm> = {
  "sha1-with-rsa-signature": "SHA-1",
  "sha256WithRSAEncryption": "SHA-256",
  "sha384WithRSAEncryption": "SHA-384",
  "sha512WithRSAEncryption": "SHA-512",
  "ecdsa-with-SHA1": "SHA-1",
  "ecdsa-with-SHA256": "SHA-256",
  "ecdsa-with-SHA384": "SHA-384",
  "ecdsa-with-SHA512": "SHA-512",
}

export const NIST_CURVES = {
  "P-192": {
    a: 0xfffffffffffffffffffffffffffffffefffffffffffffffcn,
    b: 0x64210519e59c80e70fa7e9ab72243049feb8deecc146b9b1n,
    n: 0xffffffffffffffffffffffff99def836146bc9b1b4d22831n,
    p: 0xfffffffffffffffffffffffffffffffeffffffffffffffffn,
  },
  "P-224": {
    a: 0xfffffffffffffffffffffffffffffffefffffffffffffffffffffffen,
    b: 0xb4050a850c04b3abf54132565044b0b7d7bfd8ba270b39432355ffb4n,
    n: 0xffffffffffffffffffffffffffff16a2e0b8f03e13dd29455c5c2a3dn,
    p: 0xffffffffffffffffffffffffffffffff000000000000000000000001n,
  },
  "P-256": {
    a: p256.CURVE.a,
    b: p256.CURVE.b,
    n: p256.CURVE.n,
    p: p256.CURVE.Fp.ORDER,
  },
  "P-384": {
    a: p384.CURVE.a,
    b: p384.CURVE.b,
    n: p384.CURVE.n,
    p: p384.CURVE.Fp.ORDER,
  },
  "P-521": {
    a: p521.CURVE.a,
    b: p521.CURVE.b,
    n: p521.CURVE.n,
    p: p521.CURVE.Fp.ORDER,
  },
}

export const BRAINPOOL_CURVES = {
  brainpoolP160r1: {
    a: 0x340e7be2a280eb74e2be61bada745d97e8f7c300n,
    b: 0x1e589a8595423412134faa2dbdec95c8d8675e58n,
    n: 0xe95e4a5f737059dc60df5991d45029409e60fc09n,
    p: 0xe95e4a5f737059dc60dfc7ad95b3d8139515620fn,
  },
  brainpoolP160t1: {
    a: 0xe95e4a5f737059dc60dfc7ad95b3d8139515620cn,
    b: 0x7a556b6dae535b7b51ed2c4d7daa7a0b5c55f380n,
    n: 0xe95e4a5f737059dc60df5991d45029409e60fc09n,
    p: 0xe95e4a5f737059dc60dfc7ad95b3d8139515620fn,
  },
  brainpoolP192r1: {
    a: 0x6a91174076b1e0e19c39c031fe8685c1cae040e5c69a28efn,
    b: 0x469a28ef7c28cca3dc721d044f4496bcca7ef4146fbf25c9n,
    n: 0xc302f41d932a36cda7a3462f9e9e916b5be8f1029ac4acc1n,
    p: 0xc302f41d932a36cda7a3463093d18db78fce476de1a86297n,
  },
  brainpoolP192t1: {
    a: 0xc302f41d932a36cda7a3463093d18db78fce476de1a86294n,
    b: 0x13d56ffaec78681e68f9deb43b35bec2fb68542e27897b79n,
    n: 0xc302f41d932a36cda7a3462f9e9e916b5be8f1029ac4acc1n,
    p: 0xc302f41d932a36cda7a3463093d18db78fce476de1a86297n,
  },
  brainpoolP224r1: {
    a: 0x68a5e62ca9ce6c1c299803a6c1530b514e182ad8b0042a59cad29f43n,
    b: 0x2580f63ccfe44138870713b1a92369e33e2135d266dbb372386c400bn,
    n: 0xd7c134aa264366862a18302575d0fb98d116bc4b6ddebca3a5a7939fn,
    p: 0xd7c134aa264366862a18302575d1d787b09f075797da89f57ec8c0ffn,
  },
  brainpoolP224t1: {
    a: 0xd7c134aa264366862a18302575d1d787b09f075797da89f57ec8c0fcn,
    b: 0x4b337d934104cd7bef271bf60ced1ed20da14c08b3bb64f18a60888dn,
    n: 0xd7c134aa264366862a18302575d0fb98d116bc4b6ddebca3a5a7939fn,
    p: 0xd7c134aa264366862a18302575d1d787b09f075797da89f57ec8c0ffn,
  },
  brainpoolP256r1: {
    a: 0x7d5a0975fc2c3057eef67530417affe7fb8055c126dc5c6ce94a4b44f330b5d9n,
    b: 0x26dc5c6ce94a4b44f330b5d9bbd77cbf958416295cf7e1ce6bccdc18ff8c07b6n,
    n: 0xa9fb57dba1eea9bc3e660a909d838d718c397aa3b561a6f7901e0e82974856a7n,
    p: 0xa9fb57dba1eea9bc3e660a909d838d726e3bf623d52620282013481d1f6e5377n,
  },
  brainpoolP256t1: {
    a: 0xa9fb57dba1eea9bc3e660a909d838d726e3bf623d52620282013481d1f6e5374n,
    b: 0x662c61c430d84ea4fe66a7733d0b76b7bf93ebc4af2f49256ae58101fee92b04n,
    n: 0xa9fb57dba1eea9bc3e660a909d838d718c397aa3b561a6f7901e0e82974856a7n,
    p: 0xa9fb57dba1eea9bc3e660a909d838d726e3bf623d52620282013481d1f6e5377n,
  },
  brainpoolP320r1: {
    a: 0x3ee30b568fbab0f883ccebd46d3f3bb8a2a73513f5eb79da66190eb085ffa9f492f375a97d860eb4n,
    b: 0x520883949dfdbc42d3ad198640688a6fe13f41349554b49acc31dccd884539816f5eb4ac8fb1f1a6n,
    n: 0xd35e472036bc4fb7e13c785ed201e065f98fcfa5b68f12a32d482ec7ee8658e98691555b44c59311n,
    p: 0xd35e472036bc4fb7e13c785ed201e065f98fcfa6f6f40def4f92b9ec7893ec28fcd412b1f1b32e27n,
  },
  brainpoolP320t1: {
    a: 0xd35e472036bc4fb7e13c785ed201e065f98fcfa6f6f40def4f92b9ec7893ec28fcd412b1f1b32e24n,
    b: 0xa7f561e038eb1ed560b3d147db782013064c19f27ed27c6780aaf77fb8a547ceb5b4fef422340353n,
    n: 0xd35e472036bc4fb7e13c785ed201e065f98fcfa5b68f12a32d482ec7ee8658e98691555b44c59311n,
    p: 0xd35e472036bc4fb7e13c785ed201e065f98fcfa6f6f40def4f92b9ec7893ec28fcd412b1f1b32e27n,
  },
  brainpoolP384r1: {
    a: 0x7bc382c63d8c150c3c72080ace05afa0c2bea28e4fb22787139165efba91f90f8aa5814a503ad4eb04a8c7dd22ce2826n,
    b: 0x4a8c7dd22ce28268b39b55416f0447c2fb77de107dcd2a62e880ea53eeb62d57cb4390295dbc9943ab78696fa504c11n,
    n: 0x8cb91e82a3386d280f5d6f7e50e641df152f7109ed5456b31f166e6cac0425a7cf3ab6af6b7fc3103b883202e9046565n,
    p: 0x8cb91e82a3386d280f5d6f7e50e641df152f7109ed5456b412b1da197fb71123acd3a729901d1a71874700133107ec53n,
  },
  brainpoolP384t1: {
    a: 0x8cb91e82a3386d280f5d6f7e50e641df152f7109ed5456b412b1da197fb71123acd3a729901d1a71874700133107ec50n,
    b: 0x7f519eada7bda81bd826dba647910f8c4b9346ed8ccdc64e4b1abd11756dce1d2074aa263b88805ced70355a33b471een,
    n: 0x8cb91e82a3386d280f5d6f7e50e641df152f7109ed5456b31f166e6cac0425a7cf3ab6af6b7fc3103b883202e9046565n,
    p: 0x8cb91e82a3386d280f5d6f7e50e641df152f7109ed5456b412b1da197fb71123acd3a729901d1a71874700133107ec53n,
  },
  brainpoolP512r1: {
    a: 0x7830a3318b603b89e2327145ac234cc594cbdd8d3df91610a83441caea9863bc2ded5d5aa8253aa10a2ef1c98b9ac8b57f1117a72bf2c7b9e7c1ac4d77fc94can,
    b: 0x3df91610a83441caea9863bc2ded5d5aa8253aa10a2ef1c98b9ac8b57f1117a72bf2c7b9e7c1ac4d77fc94cadc083e67984050b75ebae5dd2809bd638016f723n,
    n: 0xaadd9db8dbe9c48b3fd4e6ae33c9fc07cb308db3b3c9d20ed6639cca70330870553e5c414ca92619418661197fac10471db1d381085ddaddb58796829ca90069n,
    p: 0xaadd9db8dbe9c48b3fd4e6ae33c9fc07cb308db3b3c9d20ed6639cca703308717d4d9b009bc66842aecda12ae6a380e62881ff2f2d82c68528aa6056583a48f3n,
  },
  brainpoolP512t1: {
    a: 0xaadd9db8dbe9c48b3fd4e6ae33c9fc07cb308db3b3c9d20ed6639cca703308717d4d9b009bc66842aecda12ae6a380e62881ff2f2d82c68528aa6056583a48f3n,
    b: 0x7cbbbcf9441cfab76e1890e46884eae321f70c0bcb4981527897504bec3e36a62bcdfa2304976540f6450085f2dae145c22553b465763689180ea2571867423en,
    n: 0xaadd9db8dbe9c48b3fd4e6ae33c9fc07cb308db3b3c9d20ed6639cca70330870553e5c414ca92619418661197fac10471db1d381085ddaddb58796829ca90069n,
    p: 0xaadd9db8dbe9c48b3fd4e6ae33c9fc07cb308db3b3c9d20ed6639cca703308717d4d9b009bc66842aecda12ae6a380e62881ff2f2d82c68528aa6056583a48f3n,
  },
}

export const BRAINPOOL_CURVES_ABBR = {
  brainpoolP160r1: "BP-R-160",
  brainpoolP160t1: "BP-T-160",
  brainpoolP192r1: "BP-R-192",
  brainpoolP192t1: "BP-T-192",
  brainpoolP224r1: "BP-R-224",
  brainpoolP224t1: "BP-T-224",
  brainpoolP256r1: "BP-R-256",
  brainpoolP256t1: "BP-T-256",
  brainpoolP320r1: "BP-R-320",
  brainpoolP320t1: "BP-T-320",
  brainpoolP384r1: "BP-R-384",
  brainpoolP384t1: "BP-T-384",
  brainpoolP512r1: "BP-R-512",
  brainpoolP512t1: "BP-T-512",
}

export const id_authorityKeyIdentifier = "2.5.29.35"
export const id_subjectKeyIdentifier = "2.5.29.14"
export const id_privateKeyUsagePeriod = "2.5.29.16"
