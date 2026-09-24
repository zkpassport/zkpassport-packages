//! Stateless C ABI: each call re-derives the session from (verifier pubkey,
//! our secret) — ECDH is microseconds, and statelessness keeps the FFI trivially
//! safe. All returned strings must be freed with `zkbridge_free`.

use crate::BridgeSession;
use std::ffi::{c_char, CStr, CString};

fn arg(p: *const c_char) -> Result<&'static str, String> {
    if p.is_null() {
        return Err("null argument".into());
    }
    unsafe { CStr::from_ptr(p) }
        .to_str()
        .map_err(|_| "invalid utf8".into())
}

fn secret32(hex_str: &str) -> Result<[u8; 32], String> {
    let v = hex::decode(hex_str).map_err(|e| e.to_string())?;
    v.try_into().map_err(|_| "secret must be 32 bytes".into())
}

fn out(result: Result<String, String>) -> *mut c_char {
    let s = match result {
        Ok(v) => v,
        Err(e) => serde_json::json!({ "error": e }).to_string(),
    };
    CString::new(s).unwrap().into_raw()
}

/// Our compressed pubkey hex for a secret (to display/persist).
#[no_mangle]
pub extern "C" fn zkbridge_pubkey(verifier_pub: *const c_char, secret: *const c_char) -> *mut c_char {
    out((|| {
        let s = BridgeSession::new(arg(verifier_pub)?, &secret32(arg(secret)?)?)?;
        Ok(s.our_pubkey_hex)
    })())
}

#[no_mangle]
pub extern "C" fn zkbridge_connect_url(
    base: *const c_char,
    verifier_pub: *const c_char,
    secret: *const c_char,
    entropy: *const c_char,
) -> *mut c_char {
    out((|| {
        let s = BridgeSession::new(arg(verifier_pub)?, &secret32(arg(secret)?)?)?;
        s.connect_url(arg(base)?, &secret32(arg(entropy)?)?)
    })())
}

#[no_mangle]
pub extern "C" fn zkbridge_encrypt(
    verifier_pub: *const c_char,
    secret: *const c_char,
    method: *const c_char,
    params_json: *const c_char,
    entropy: *const c_char,
) -> *mut c_char {
    out((|| {
        let s = BridgeSession::new(arg(verifier_pub)?, &secret32(arg(secret)?)?)?;
        let params: serde_json::Value =
            serde_json::from_str(arg(params_json)?).map_err(|e| e.to_string())?;
        // JSON array of frames — the caller sends each as its own ws message.
        let frames = s.encrypt_messages(arg(method)?, &params, &secret32(arg(entropy)?)?)?;
        serde_json::to_string(&frames).map_err(|e| e.to_string())
    })())
}

#[no_mangle]
pub extern "C" fn zkbridge_decrypt(
    verifier_pub: *const c_char,
    secret: *const c_char,
    frame: *const c_char,
) -> *mut c_char {
    out((|| {
        let s = BridgeSession::new(arg(verifier_pub)?, &secret32(arg(secret)?)?)?;
        s.decrypt_frame(arg(frame)?).map(|v| v.to_string())
    })())
}

/// # Safety
/// `s` must be a pointer returned by this library (or null).
#[no_mangle]
pub unsafe extern "C" fn zkbridge_free(s: *mut c_char) {
    if !s.is_null() {
        drop(unsafe { CString::from_raw(s) });
    }
}
