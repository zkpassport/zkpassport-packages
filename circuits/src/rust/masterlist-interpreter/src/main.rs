use std::env;
use std::fs::File;
use std::io::Read;
use prelude::der_parser::ber::BerObjectContent;
use public_key::{PublicKey, RSAPublicKey};
use x509_parser::prelude::*;
use std::io::BufReader;
use x509_parser::pem::Pem;
use std::fs::OpenOptions;
use std::io::Write;
use serde_json::{json, Value};
use der_parser;
use x509_parser::der_parser::asn1_rs::FromDer;
use x509_parser::time::ASN1Time;
use x509_parser::extensions::AuthorityKeyIdentifier;
use x509_parser::der_parser::ber::*;
use x509_parser::der_parser::der::*;
use asn1_rs::GeneralizedTime;
use std::path::Path;
use std::fs;
use std::collections::HashSet;

extern crate noir_bignum_paramgen;
use noir_bignum_paramgen::compute_barrett_reduction_parameter;
extern crate num_bigint;
use num_bigint::BigUint;
extern crate x509_parser;
extern crate serde_json;
extern crate asn1_rs;

const OIDS_TO_DESCRIPTION: &[(&str, &str)] = &[
    ("1.2.840.113549.1.1.5", "sha1-with-rsa-signature"),
    ("1.2.840.113549.1.1.11", "sha256WithRSAEncryption"),
    ("1.2.840.113549.1.1.12", "sha384WithRSAEncryption"),
    ("1.2.840.113549.1.1.13", "sha512WithRSAEncryption"),
    ("1.2.840.113549.1.1.10", "rsassa-pss"),
    ("1.2.840.10045.4.1", "ecdsa-with-SHA1"),
    ("1.2.840.10045.4.3.2", "ecdsa-with-SHA256"),
    ("1.2.840.10045.4.3.3", "ecdsa-with-SHA384"),
    ("1.2.840.10045.4.3.4", "ecdsa-with-SHA512"),
];

fn get_oid_description(oid: &str) -> String {
    OIDS_TO_DESCRIPTION.iter().find(|&&(oid_str, _)| oid_str == oid).map(|&(_, desc)| desc.to_string()).unwrap_or_else(|| oid.to_string())
}

#[derive(Debug)]
struct PrivateKeyUsagePeriod {
    not_before: Option<GeneralizedTime>,
    not_after: Option<GeneralizedTime>,
}

impl PrivateKeyUsagePeriod {
    fn from_der(input: &[u8]) -> Result<(Vec<u8>, Self), der_parser::error::Error> {
        let (rem, sequence) = parse_der_sequence(input)?;
        let mut not_before = None;
        let mut not_after = None;

        for content in sequence.ref_iter() {
            match content.tag() {
                Tag(0) => {
                    if let BerObjectContent::Unknown(val) = &content.content {
                        if let Ok(date) = GeneralizedTime::from_bytes(val.data) {
                            not_before = Some(date);
                        }
                    }
                },
                Tag(1) => {
                    if let BerObjectContent::Unknown(val) = &content.content {
                        if let Ok(date) = GeneralizedTime::from_bytes(val.data) {
                            not_after = Some(date);
                        }
                    }
                },
                _ => {}
            }
        }

        Ok((rem.to_vec(), PrivateKeyUsagePeriod { not_before, not_after }))
    }
}

fn parse_certificates(cert_path: &str) -> Result<Vec<(Vec<u8>, String, Vec<u8>, String, i64, i64, usize,Option<Vec<u8>>, Option<(Option<i64>, Option<i64>)>)>, Box<dyn std::error::Error>> {
    let cert_file = File::open(cert_path)?;
    let mut reader = BufReader::new(cert_file);
    let mut results = Vec::new();

    loop {
        match Pem::read(&mut reader) {
            Ok((pem, _)) => {
                if let Ok((_, cert)) = X509Certificate::from_der(&pem.contents) {
                    let country_code = cert.issuer().iter_country()
                        .next()
                        .map(|c| c.as_str().unwrap().to_string())
                        .unwrap_or_else(|| "Unknown".to_string());

                    let not_before = cert.validity().not_before.timestamp();
                    let not_after = cert.validity().not_after.timestamp();

                    let auth_key_id = cert.extensions()
                        .iter()
                        .find(|ext| ext.oid.to_id_string() == "2.5.29.35")
                        .and_then(|ext| AuthorityKeyIdentifier::from_der(ext.value).ok())
                        .and_then(|(_, aki)| aki.key_identifier.map(|ki| ki.0.to_vec()));

                    let private_key_usage_period = cert.extensions()
                        .iter()
                        .find(|ext| ext.oid.to_id_string() == "2.5.29.16")
                        .and_then(|ext| PrivateKeyUsagePeriod::from_der(ext.value).ok())
                        .map(|(_, period)| (
                            period.not_before.map(|t| t.utc_datetime().unwrap().unix_timestamp()),
                            period.not_after.map(|t| t.utc_datetime().unwrap().unix_timestamp())
                        ));

                    if let Ok(spki) = cert.public_key().parsed() {
                        if let PublicKey::RSA(rsa_pub_key) = spki {
                            let modulus = rsa_pub_key.modulus.to_vec();
                            let trimmed_modulus = modulus.iter()
                                .skip_while(|&&x| x == 0)
                                .copied()
                                .collect::<Vec<u8>>();
                            
                            results.push((
                                trimmed_modulus,
                                get_oid_description(&cert.signature_algorithm.algorithm.to_id_string()),
                                rsa_pub_key.exponent.to_vec(),
                                country_code,
                                not_before,
                                not_after,
                                rsa_pub_key.key_size(),
                                auth_key_id,
                                private_key_usage_period
                            ));
                        } else if let PublicKey::EC(ecdsa_pub_key) = spki { 
                            let params = cert.subject_pki.algorithm.parameters();   
                            if let Some(parsed_params) = params {
                                results.push((
                                    // Skip the first byte as it's a 0x04 prefix
                                    ecdsa_pub_key.data()[1..].to_vec(),
                                    get_oid_description(&cert.signature_algorithm.algorithm.to_id_string()),
                                    parsed_params.as_bytes().to_vec(),
                                    country_code,
                                    not_before,
                                    not_after,
                                    ecdsa_pub_key.key_size(),
                                    auth_key_id,
                                    private_key_usage_period
                                ));
                            }
                        }
                    }
                }
            }
            Err(_) => break,
        }
    }

    if results.is_empty() {
        return Err("No valid certificates found".into());
    }

    Ok(results)
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut unique_pubkeys = HashSet::new();
    let mut all_certificates = Vec::new();

    if args.len() != 2 {
        println!("Usage: {} <path_to_certificate_or_directory>", args[0]);
        return;
    }

    let path = Path::new(&args[1]);

    if path.is_dir() {
        for entry in fs::read_dir(path).expect("Failed to read directory") {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) == Some("cer") {
                    process_certificate_file(&path, &mut all_certificates, &mut unique_pubkeys);
                }
            }
        }
    } else if path.is_file() {
        process_certificate_file(path, &mut all_certificates, &mut unique_pubkeys);
    } else {
        println!("Error: {} is neither a valid file nor directory", args[1]);
        return;
    }

    // Sort and write output
    all_certificates.sort_by(|a, b| {
        let country_a = a["issuing_country"].as_str().unwrap_or("");
        let country_b = b["issuing_country"].as_str().unwrap_or("");
        country_a.cmp(country_b)
    });

    let output = json!({
        "certificates": all_certificates
    });

    let file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open("csc-masterlist.json")
        .expect("Failed to create output file");

    serde_json::to_writer_pretty(file, &output)
        .expect("Failed to write JSON to file");

    println!("Results have been written to csc-masterlist.json");
}

// Helper function to process a single certificate file
fn process_certificate_file(path: &Path, all_certificates: &mut Vec<Value>, unique_pubkeys: &mut HashSet<Vec<u8>>) {
    match parse_certificates(path.to_str().unwrap()) {
        Ok(certs) => {
            for cert in certs {
                let (pubkey, sig_algo, params, country_code, not_before, not_after, key_size, auth_key_id, private_key_usage_period) = cert;
                
                if !unique_pubkeys.insert(pubkey.clone()) {
                    continue;
                }

                let cert_data = json!({
                    "signature_algorithm": sig_algo,
                    "public_key": pubkey,
                    "parameters": params,
                    "issuing_country": country_code.to_uppercase(),
                    "validity": {
                        "not_before": not_before,
                        "not_after": not_after
                    },
                    "key_size": key_size,
                    "authority_key_identifier": auth_key_id.as_ref().map(|bytes| bytes.iter().map(|b| format!("{:02x}", b)).collect::<Vec<String>>().join("")),
                    "private_key_usage_period": private_key_usage_period.as_ref().map(|(not_before, not_after)| {
                        json!({
                            "not_before": not_before,
                            "not_after": not_after
                        })
                    })
                });
                
                all_certificates.push(cert_data);
            }
        }
        Err(e) => println!("Error parsing certificate file {:?}: {}", path, e),
    }
}
