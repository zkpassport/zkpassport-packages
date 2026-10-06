//! Minimal zero-copy DER reader.
//!
//! The SOD parser slices fields directly out of the original DER (as the TS
//! implementation does via asn1js buffers), so no re-encoding can introduce
//! byte differences on quirky real-world documents.

use num_bigint::BigUint;

#[derive(Clone, Copy)]
pub struct Tlv<'a> {
    pub tag: u8,
    /// The full TLV including header.
    pub raw: &'a [u8],
    /// The content octets.
    pub content: &'a [u8],
}

impl<'a> Tlv<'a> {
    pub fn expect_tag(&self, tag: u8, what: &str) -> Result<&Self, String> {
        if self.tag != tag {
            return Err(format!(
                "{what}: expected tag 0x{tag:02x}, got 0x{:02x}",
                self.tag
            ));
        }
        Ok(self)
    }

    /// Children of a constructed TLV.
    pub fn children(&self) -> Result<Vec<Tlv<'a>>, String> {
        let mut out = Vec::new();
        let mut reader = Reader::new(self.content);
        while !reader.at_end() {
            out.push(reader.read()?);
        }
        Ok(out)
    }

    /// INTEGER content as unsigned bigint (leading sign byte stripped).
    pub fn as_biguint(&self) -> BigUint {
        BigUint::from_bytes_be(self.content)
    }

    pub fn as_u64(&self) -> Result<u64, String> {
        if self.content.len() > 9 || (self.content.len() == 9 && self.content[0] != 0) {
            return Err("integer too large for u64".into());
        }
        let mut v: u64 = 0;
        for &b in self.content {
            v = (v << 8) | b as u64;
        }
        Ok(v)
    }

    /// OBJECT IDENTIFIER content as dotted string.
    pub fn as_oid(&self) -> Result<String, String> {
        let bytes = self.content;
        if bytes.is_empty() {
            return Err("empty OID".into());
        }
        let mut parts = vec![(bytes[0] / 40).to_string(), (bytes[0] % 40).to_string()];
        let mut value: u64 = 0;
        for &b in &bytes[1..] {
            value = (value << 7) | (b & 0x7f) as u64;
            if b & 0x80 == 0 {
                parts.push(value.to_string());
                value = 0;
            }
        }
        Ok(parts.join("."))
    }

    /// BIT STRING content with the unused-bits byte stripped.
    pub fn bit_string_bytes(&self) -> Result<&'a [u8], String> {
        if self.content.is_empty() {
            return Err("empty BIT STRING".into());
        }
        Ok(&self.content[1..])
    }
}

pub struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, pos: 0 }
    }

    pub fn at_end(&self) -> bool {
        self.pos >= self.data.len()
    }

    pub fn read(&mut self) -> Result<Tlv<'a>, String> {
        let start = self.pos;
        let data = self.data;
        if start + 2 > data.len() {
            return Err("truncated TLV header".into());
        }
        let tag = data[start];
        if tag & 0x1f == 0x1f {
            return Err("multi-byte tags not supported".into());
        }
        let mut idx = start + 1;
        let first = data[idx];
        idx += 1;
        let length = if first & 0x80 == 0 {
            first as usize
        } else {
            let num_bytes = (first & 0x7f) as usize;
            if num_bytes == 0 || num_bytes > 4 || idx + num_bytes > data.len() {
                return Err("unsupported DER length".into());
            }
            let mut len = 0usize;
            for _ in 0..num_bytes {
                len = (len << 8) | data[idx] as usize;
                idx += 1;
            }
            len
        };
        if idx + length > data.len() {
            return Err("TLV content exceeds buffer".into());
        }
        self.pos = idx + length;
        Ok(Tlv {
            tag,
            raw: &data[start..self.pos],
            content: &data[idx..self.pos],
        })
    }
}
