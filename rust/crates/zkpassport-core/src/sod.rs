//! SOD (Document Security Object) parser.
//!
//! Port of `SOD.fromDER` (`passport/sod.ts`), `DSC.fromCertificate`
//! (`passport/dsc.ts`), `getRSAInfo`/`getECDSAInfo`/`getRSAPSSParams`
//! (`cms/utils.ts`) and `getDSCCountry` — scoped to the fields the circuit
//! input builders consume. All byte fields are slices of the original DER.

use crate::curves_gen::CURVE_PARAMS;
use crate::der::{Reader, Tlv};
use crate::oids_gen::{alpha2_to_alpha3, curve_oid_name, hash_alg_name, sig_alg_name};
use num_bigint::BigUint;

const TAG_INTEGER: u8 = 0x02;
const TAG_BIT_STRING: u8 = 0x03;
const TAG_OCTET_STRING: u8 = 0x04;
const TAG_OID: u8 = 0x06;
const TAG_SEQUENCE: u8 = 0x30;
const TAG_SET: u8 = 0x31;
const TAG_CTX_0: u8 = 0xa0;

#[derive(Clone)]
pub enum SodPublicKey {
    Rsa {
        /// Minimal big-endian modulus bytes (sign byte stripped).
        modulus: Vec<u8>,
        exponent: u64,
    },
    Ecdsa {
        /// Uncompressed point (0x04 ‖ X ‖ Y).
        public_key: Vec<u8>,
        curve: String,
    },
}

#[derive(Clone)]
pub struct ParsedSod {
    /// eContent octets (the LDSSecurityObject DER).
    pub e_content: Vec<u8>,
    /// signedAttrs TLV re-tagged as SET (0x31) — the bytes that are signed.
    pub signed_attributes: Vec<u8>,
    /// SignerInfo signature octets.
    pub signer_signature: Vec<u8>,
    /// SignerInfo signature algorithm name (TS `getOIDName`).
    pub signer_sig_alg: String,
    /// Raw DER of the signature algorithm parameters, if present.
    pub signer_sig_alg_params: Option<Vec<u8>>,
    /// SignerInfo digest algorithm name (TS `getHashAlgorithmName`, e.g. "SHA-256").
    pub signer_digest_alg: String,
    /// Data-group hash algorithm name from the LDSSecurityObject.
    pub dg_hash_alg: String,
    /// (data group number, hash bytes) pairs from the LDSSecurityObject.
    pub dg_hashes: Vec<(u32, Vec<u8>)>,
    /// DSC TBSCertificate raw TLV.
    pub tbs_certificate: Vec<u8>,
    /// DSC certificate signatureAlgorithm name (outer, i.e. the CSCA's choice).
    pub cert_sig_alg: String,
    /// Raw DER of the certificate signature algorithm parameters, if present.
    pub cert_sig_alg_params: Option<Vec<u8>>,
    /// CSCA's signature over the DSC (BIT STRING content).
    pub cert_signature: Vec<u8>,
    /// DSC country per `getDSCCountry` (issuer countryName, alpha-3).
    pub dsc_country: String,
    /// DSC subject public key.
    pub public_key: SodPublicKey,
    /// DSC authorityKeyIdentifier keyIdentifier, lowercase hex (no 0x).
    pub authority_key_identifier: Option<String>,
}

impl ParsedSod {
    /// `getSodSignatureAlgorithmType`
    pub fn signature_type(&self) -> &'static str {
        let name = self.signer_sig_alg.to_lowercase();
        if name.contains("rsa") {
            "RSA"
        } else if name.contains("ecdsa") {
            "ECDSA"
        } else {
            ""
        }
    }

    /// The `pss_salt_len` the ID-data builder needs: PSS params' saltLength,
    /// falling back to the signer hash length (TS getIDDataCircuitInputs).
    pub fn sod_pss_salt_len(&self) -> Result<u32, String> {
        if !self.signer_sig_alg.to_lowercase().contains("pss") {
            return Ok(0);
        }
        if let Some(params) = &self.signer_sig_alg_params {
            return Ok(parse_pss_salt_length(params)?);
        }
        hash_len_from_name(&sod_sig_hash_algorithm(
            &self.signer_sig_alg,
            &self.signer_digest_alg,
        ))
    }
}

/// `getSodSignatureAlgorithmHashAlgorithm`: sha name embedded in the
/// signature algorithm name, else the signer digest algorithm.
fn sod_sig_hash_algorithm(sig_alg: &str, digest_alg: &str) -> String {
    let name = sig_alg.to_lowercase();
    for sha in ["sha1", "sha224", "sha256", "sha384", "sha512"] {
        if name.contains(sha) {
            return sha.to_string();
        }
    }
    digest_alg.to_lowercase().replace("-", "")
}

fn hash_len_from_name(name: &str) -> Result<u32, String> {
    match name {
        "sha1" => Ok(20),
        "sha224" => Ok(28),
        "sha256" => Ok(32),
        "sha384" => Ok(48),
        "sha512" => Ok(64),
        other => Err(format!("unknown hash algorithm: {other}")),
    }
}

/// RSASSA-PSS-params: [2] saltLength INTEGER, DEFAULT 20.
pub fn pss_salt_length_from_params(params: &[u8]) -> Result<u32, String> {
    parse_pss_salt_length(params)
}

/// RSASSA-PSS-params: [0] hashAlgorithm, DEFAULT SHA-1. Returns the TS
/// `getRSAPSSParams().hashAlgorithm` name family ("SHA-256" style).
pub fn pss_hash_algorithm_from_params(params: &[u8]) -> Result<String, String> {
    let tlv = Reader::new(params).read()?;
    tlv.expect_tag(TAG_SEQUENCE, "RSASSA-PSS-params")?;
    for child in tlv.children()? {
        if child.tag == 0xa0 {
            let alg = Reader::new(child.content).read()?;
            let (oid, _) = parse_algorithm_identifier(&alg)?;
            return Ok(hash_name_or_raw(&oid));
        }
    }
    Ok("SHA-1".into())
}

fn parse_pss_salt_length(params: &[u8]) -> Result<u32, String> {
    let tlv = Reader::new(params).read()?;
    tlv.expect_tag(TAG_SEQUENCE, "RSASSA-PSS-params")?;
    for child in tlv.children()? {
        if child.tag == 0xa2 {
            let inner = Reader::new(child.content).read()?;
            inner.expect_tag(TAG_INTEGER, "saltLength")?;
            return Ok(inner.as_u64()? as u32);
        }
    }
    Ok(20)
}

fn oid_name_or_raw(oid: &str) -> String {
    sig_alg_name(oid).map(str::to_string).unwrap_or_else(|| oid.to_string())
}

fn hash_name_or_raw(oid: &str) -> String {
    hash_alg_name(oid).map(str::to_string).unwrap_or_else(|| oid.to_string())
}

/// AlgorithmIdentifier ::= SEQUENCE { algorithm OID, parameters ANY OPTIONAL }
/// Returns (oid, raw params TLV if present and not NULL-only semantics kept as raw).
fn parse_algorithm_identifier<'b>(tlv: &Tlv<'b>) -> Result<(String, Option<&'b [u8]>), String> {
    tlv.expect_tag(TAG_SEQUENCE, "AlgorithmIdentifier")?;
    let children = tlv.children()?;
    let oid = children
        .first()
        .ok_or("empty AlgorithmIdentifier")?
        .expect_tag(TAG_OID, "algorithm")?
        .as_oid()?;
    let params = children.get(1).map(|c| c.raw);
    Ok((oid, params))
}

/// First countryName (2.5.4.6) attribute value in an X.501 Name.
fn name_country(name_tlv: &Tlv) -> Result<Option<String>, String> {
    for rdn in name_tlv.children()? {
        for attr in rdn.children()? {
            let parts = attr.children()?;
            let (Some(oid_tlv), Some(value_tlv)) = (parts.first(), parts.get(1)) else {
                continue;
            };
            if oid_tlv.tag == TAG_OID && oid_tlv.as_oid()? == "2.5.4.6" {
                return Ok(Some(
                    String::from_utf8_lossy(value_tlv.content).to_string(),
                ));
            }
        }
    }
    Ok(None)
}

/// `getDSCCountry`: issuer countryName (alpha-2 converted to alpha-3),
/// falling back to the subject.
fn dsc_country(issuer: &Tlv, subject: &Tlv) -> Result<String, String> {
    let country = match name_country(issuer)? {
        Some(c) => Some(c),
        None => name_country(subject)?,
    };
    Ok(match country {
        Some(c) if c.len() == 2 => alpha2_to_alpha3(&c.to_uppercase())
            .map(str::to_string)
            .unwrap_or(c),
        Some(c) => c,
        None => String::new(),
    })
}

/// ECParameters: named curve OID, or explicitly specified params matched
/// against the known curve tables (as TS `getCurveName`).
fn curve_from_ec_params(params: &[u8]) -> Result<String, String> {
    let tlv = Reader::new(params).read()?;
    if tlv.tag == TAG_OID {
        let oid = tlv.as_oid()?;
        return curve_oid_name(&oid)
            .map(str::to_string)
            .ok_or(format!("Unknown curve OID: {oid}"));
    }
    tlv.expect_tag(TAG_SEQUENCE, "specifiedCurve")?;
    let children = tlv.children()?;
    // SEQ { version, fieldID SEQ{oid, prime}, curve SEQ{a, b, seed?}, base, order, cofactor? }
    let field_id = children.get(1).ok_or("specifiedCurve: missing fieldID")?;
    let p = field_id
        .children()?
        .get(1)
        .ok_or("fieldID: missing prime")?
        .as_biguint();
    let curve_seq = children.get(2).ok_or("specifiedCurve: missing curve")?;
    let curve_children = curve_seq.children()?;
    let a = BigUint::from_bytes_be(curve_children.first().ok_or("curve: missing a")?.content);
    let b = BigUint::from_bytes_be(curve_children.get(1).ok_or("curve: missing b")?.content);
    let n = children
        .get(4)
        .ok_or("specifiedCurve: missing order")?
        .as_biguint();
    let hex = |s: &str| BigUint::parse_bytes(s.as_bytes(), 16).unwrap();
    for (name, ca, cb, cn, cp) in CURVE_PARAMS {
        if a == hex(ca) && b == hex(cb) && n == hex(cn) && p == hex(cp) {
            return Ok(name.to_string());
        }
    }
    Err("Unknown specified curve".into())
}

/// authorityKeyIdentifier (2.5.29.35) keyIdentifier from the TBS extensions
/// ([3] EXPLICIT Extensions). Returns lowercase hex without 0x.
fn authority_key_identifier(tbs_children: &[Tlv]) -> Result<Option<String>, String> {
    let Some(ext_wrapper) = tbs_children.iter().find(|c| c.tag == 0xa3) else {
        return Ok(None);
    };
    let extensions = Reader::new(ext_wrapper.content).read()?;
    extensions.expect_tag(TAG_SEQUENCE, "Extensions")?;
    for ext in extensions.children()? {
        let parts = ext.children()?;
        let Some(oid_tlv) = parts.first() else {
            continue;
        };
        if oid_tlv.tag != TAG_OID || oid_tlv.as_oid()? != "2.5.29.35" {
            continue;
        }
        // extnValue OCTET STRING (possibly preceded by BOOLEAN critical)
        let Some(value) = parts.iter().find(|p| p.tag == TAG_OCTET_STRING) else {
            continue;
        };
        let aki = Reader::new(value.content).read()?;
        aki.expect_tag(TAG_SEQUENCE, "AuthorityKeyIdentifier")?;
        for field in aki.children()? {
            // [0] IMPLICIT keyIdentifier
            if field.tag == 0x80 {
                let hex: String = field.content.iter().map(|b| format!("{b:02x}")).collect();
                return Ok(Some(hex));
            }
        }
        return Ok(None);
    }
    Ok(None)
}

fn parse_spki(spki: &Tlv) -> Result<SodPublicKey, String> {
    spki.expect_tag(TAG_SEQUENCE, "SubjectPublicKeyInfo")?;
    let children = spki.children()?;
    let (alg_oid, alg_params) =
        parse_algorithm_identifier(children.first().ok_or("SPKI: missing algorithm")?)?;
    let key_bits = children
        .get(1)
        .ok_or("SPKI: missing subjectPublicKey")?
        .expect_tag(TAG_BIT_STRING, "subjectPublicKey")?
        .bit_string_bytes()?;
    match alg_oid.as_str() {
        // rsaEncryption / rsaPSS
        "1.2.840.113549.1.1.1" | "1.2.840.113549.1.1.10" => {
            let rsa = Reader::new(key_bits).read()?;
            rsa.expect_tag(TAG_SEQUENCE, "RSAPublicKey")?;
            let parts = rsa.children()?;
            let modulus = parts
                .first()
                .ok_or("RSAPublicKey: missing modulus")?
                .as_biguint();
            let exponent = parts
                .get(1)
                .ok_or("RSAPublicKey: missing exponent")?
                .as_u64()?;
            Ok(SodPublicKey::Rsa {
                modulus: modulus.to_bytes_be(),
                exponent,
            })
        }
        // ecPublicKey
        "1.2.840.10045.2.1" => {
            let params = alg_params.ok_or("ecPublicKey: missing parameters")?;
            Ok(SodPublicKey::Ecdsa {
                public_key: key_bits.to_vec(),
                curve: curve_from_ec_params(params)?,
            })
        }
        other => Err(format!("unsupported public key algorithm: {other}")),
    }
}

pub fn parse_sod(der: &[u8]) -> Result<ParsedSod, String> {
    // Strip the ICAO 0x77 0x82 wrapper, as TS SOD.fromDER does.
    let der = if der.len() > 4 && der[0] == 0x77 && der[1] == 0x82 {
        &der[4..]
    } else {
        der
    };

    // ContentInfo ::= SEQUENCE { contentType OID, [0] content }
    let content_info = Reader::new(der).read()?;
    content_info.expect_tag(TAG_SEQUENCE, "ContentInfo")?;
    let ci_children = content_info.children()?;
    let signed_data = Reader::new(
        ci_children
            .get(1)
            .ok_or("ContentInfo: missing content")?
            .expect_tag(TAG_CTX_0, "ContentInfo content")?
            .content,
    )
    .read()?;
    signed_data.expect_tag(TAG_SEQUENCE, "SignedData")?;

    // SignedData ::= SEQUENCE { version, digestAlgorithms SET, encapContentInfo SEQ,
    //                           [0] certificates, [1] crls?, signerInfos SET }
    let sd = signed_data.children()?;
    let mut idx = 0;
    let _version = sd.get(idx).ok_or("SignedData: missing version")?;
    idx += 1;
    let _digest_algs = sd.get(idx).ok_or("SignedData: missing digestAlgorithms")?;
    idx += 1;
    let encap = sd
        .get(idx)
        .ok_or("SignedData: missing encapContentInfo")?
        .expect_tag(TAG_SEQUENCE, "encapContentInfo")?;
    idx += 1;

    // encapContentInfo ::= SEQUENCE { eContentType OID, [0] { OCTET STRING } }
    let encap_children = encap.children()?;
    let e_content_wrapper = encap_children
        .get(1)
        .ok_or("encapContentInfo: missing eContent")?
        .expect_tag(TAG_CTX_0, "eContent wrapper")?;
    let e_content_octets = Reader::new(e_content_wrapper.content).read()?;
    e_content_octets.expect_tag(TAG_OCTET_STRING, "eContent")?;
    let e_content = e_content_octets.content;

    // LDSSecurityObject ::= SEQ { version INT, hashAlgorithm SEQ, SEQ OF DataGroupHash }
    let lds = Reader::new(e_content).read()?;
    lds.expect_tag(TAG_SEQUENCE, "LDSSecurityObject")?;
    let lds_children = lds.children()?;
    let (dg_hash_alg_oid, _) =
        parse_algorithm_identifier(lds_children.get(1).ok_or("LDS: missing hashAlgorithm")?)?;
    let mut dg_hashes = Vec::new();
    for dg in lds_children
        .get(2)
        .ok_or("LDS: missing dataGroupHashValues")?
        .children()?
    {
        let parts = dg.children()?;
        let number = parts.first().ok_or("DataGroupHash: missing number")?.as_u64()? as u32;
        let hash = parts.get(1).ok_or("DataGroupHash: missing hash")?.content;
        dg_hashes.push((number, hash.to_vec()));
    }

    // [0] certificates — first is the DSC
    let certs = sd
        .get(idx)
        .ok_or("SignedData: missing certificates")?
        .expect_tag(TAG_CTX_0, "certificates")?;
    let dsc = Reader::new(certs.content).read()?;
    dsc.expect_tag(TAG_SEQUENCE, "Certificate")?;
    let dsc_children = dsc.children()?;
    let tbs = dsc_children.first().ok_or("Certificate: missing TBS")?;
    tbs.expect_tag(TAG_SEQUENCE, "TBSCertificate")?;
    let (cert_sig_alg_oid, cert_sig_params) =
        parse_algorithm_identifier(dsc_children.get(1).ok_or("Certificate: missing sigalg")?)?;
    let cert_signature = dsc_children
        .get(2)
        .ok_or("Certificate: missing signature")?
        .expect_tag(TAG_BIT_STRING, "certificate signature")?
        .bit_string_bytes()?;

    // TBSCertificate: [0] version?, serial, sigalg, issuer, validity, subject, SPKI, ...
    let tbs_children = tbs.children()?;
    let mut t = 0;
    if tbs_children
        .first()
        .is_some_and(|c| c.tag == TAG_CTX_0)
    {
        t += 1; // explicit version
    }
    let _serial = tbs_children.get(t).ok_or("TBS: missing serial")?;
    let issuer = tbs_children.get(t + 2).ok_or("TBS: missing issuer")?;
    let subject = tbs_children.get(t + 4).ok_or("TBS: missing subject")?;
    let spki = tbs_children.get(t + 5).ok_or("TBS: missing SPKI")?;

    // signerInfos SET → first SignerInfo
    let signer_infos = sd
        .get(sd.len() - 1)
        .ok_or("SignedData: missing signerInfos")?
        .expect_tag(TAG_SET, "signerInfos")?;
    let signer = Reader::new(signer_infos.content).read()?;
    signer.expect_tag(TAG_SEQUENCE, "SignerInfo")?;
    // SignerInfo ::= SEQ { version, sid, digestAlgorithm, [0] signedAttrs,
    //                      signatureAlgorithm, signature }
    let si = signer.children()?;
    let (signer_digest_oid, _) =
        parse_algorithm_identifier(si.get(2).ok_or("SignerInfo: missing digestAlgorithm")?)?;
    let signed_attrs = si
        .get(3)
        .ok_or("SignerInfo: missing signedAttrs")?
        .expect_tag(TAG_CTX_0, "signedAttrs")?;
    // The signed bytes are the signedAttrs TLV with the implicit [0] tag
    // replaced by SET (0x31) — equivalent to the TS AttributeSet re-serialization.
    let mut signed_attributes = signed_attrs.raw.to_vec();
    signed_attributes[0] = TAG_SET;
    let (signer_sig_alg_oid, signer_sig_params) = parse_algorithm_identifier(
        si.get(4).ok_or("SignerInfo: missing signatureAlgorithm")?,
    )?;
    let signature = si
        .get(5)
        .ok_or("SignerInfo: missing signature")?
        .expect_tag(TAG_OCTET_STRING, "signature")?
        .content;

    Ok(ParsedSod {
        e_content: e_content.to_vec(),
        signed_attributes,
        signer_signature: signature.to_vec(),
        signer_sig_alg: oid_name_or_raw(&signer_sig_alg_oid),
        signer_sig_alg_params: signer_sig_params.map(|p| p.to_vec()),
        signer_digest_alg: hash_name_or_raw(&signer_digest_oid),
        dg_hash_alg: hash_name_or_raw(&dg_hash_alg_oid),
        dg_hashes,
        tbs_certificate: tbs.raw.to_vec(),
        cert_sig_alg: oid_name_or_raw(&cert_sig_alg_oid),
        cert_sig_alg_params: cert_sig_params.map(|p| p.to_vec()),
        cert_signature: cert_signature.to_vec(),
        dsc_country: dsc_country(issuer, subject)?,
        public_key: parse_spki(spki)?,
        authority_key_identifier: authority_key_identifier(&tbs_children)?,
    })
}
