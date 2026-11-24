// The one circuits release family this library parses: 0.23.x outer proofs carry K + 6 public
// inputs, ending in the verification method. Another minor release may change that layout.
pub global SUPPORTED_CIRCUITS_MAJOR: u16 = 0;
pub global SUPPORTED_CIRCUITS_MINOR: u16 = 23;

global TWO_POW_208: Field = 2.pow_32(208);
global TWO_POW_224: Field = 2.pow_32(224);
global TWO_POW_240: Field = 2.pow_32(240);

/// A circuits release as the registry keys verification keys by it, and as the ZKPassport SDK
/// sends it to L1: major, minor and patch as 2-byte big-endian integers, left-aligned in 32 bytes.
/// "0.23.0" is `circuit_version(0, 23, 0)` = 0x0000001700…00.
pub fn circuit_version(major: u16, minor: u16, patch: u16) -> Field {
    assert((major != 0) | (minor != 0) | (patch != 0), "circuit version 0.0.0 encodes to 0");
    // A Field is below the BN254 scalar field modulus, 0x30644e72e131a029…, so a version from
    // major 0x3064 up can wrap around
    assert(major < 0x3064, "circuit version major must be below 12388");
    (major as Field) * TWO_POW_240 + (minor as Field) * TWO_POW_224 + (patch as Field) * TWO_POW_208
}

/// The oldest circuits release this library verifies.
pub global MIN_SUPPORTED_CIRCUIT_VERSION: Field = circuit_version(0, 23, 0);

/// Splits a packed circuits release into (major, minor, patch), failing on any other bits.
pub fn unpack_circuit_version(version: Field) -> (u16, u16, u16) {
    let bytes: [u8; 32] = version.to_be_bytes();
    for i in 6..32 {
        assert(bytes[i] == 0, "malformed circuits version");
    }
    let major = (bytes[0] as u16) * 256 + (bytes[1] as u16);
    let minor = (bytes[2] as u16) * 256 + (bytes[3] as u16);
    let patch = (bytes[4] as u16) * 256 + (bytes[5] as u16);
    (major, minor, patch)
}

/// Checks that a proof's circuits release is one this library parses, and no older than
/// `min_version`.
///
/// The registry authenticates the version (it only accepts a vk under the release that built
/// it), but a release it accepts may still lay out its public inputs differently, so the family
/// is checked here.
pub fn assert_circuit_version_supported(version: Field, min_version: Field) {
    let (major, minor, patch) = unpack_circuit_version(version);
    // Circuits are below 1.0.0, so a minor release may break the public-input layout while a
    // patch release keeps it: every patch of the supported minor release is accepted.
    assert(
        (major == SUPPORTED_CIRCUITS_MAJOR) & (minor == SUPPORTED_CIRCUITS_MINOR),
        "unsupported circuits version",
    );

    let (min_major, min_minor, min_patch) = unpack_circuit_version(min_version);
    let at_least_min = (major > min_major)
        | (
            (major == min_major)
                & ((minor > min_minor) | ((minor == min_minor) & (patch >= min_patch)))
        );
    assert(at_least_min, "circuits version older than the service accepts");
}

mod test {
    use crate::version::{
        assert_circuit_version_supported, circuit_version, MIN_SUPPORTED_CIRCUIT_VERSION,
        unpack_circuit_version,
    };

    #[test]
    fn packs_like_the_sdk() {
        // circuitVersionToBytes32("0.23.0") in @zkpassport/utils
        assert_eq(
            circuit_version(0, 23, 0),
            0x0000001700000000000000000000000000000000000000000000000000000000,
        );
        assert_eq(
            circuit_version(1, 2, 3),
            0x0001000200030000000000000000000000000000000000000000000000000000,
        );
        assert_eq(
            circuit_version(12387, 65535, 65535),
            0x3063ffffffff0000000000000000000000000000000000000000000000000000,
        );
    }

    #[test(should_fail_with = "circuit version 0.0.0 encodes to 0")]
    fn rejects_0_0_0() {
        let _ = circuit_version(0, 0, 0);
    }

    #[test(should_fail_with = "circuit version major must be below 12388")]
    fn rejects_a_major_from_12388() {
        let _ = circuit_version(12388, 0, 0);
    }

    #[test]
    fn unpacks_what_it_packs() {
        let (major, minor, patch) = unpack_circuit_version(circuit_version(258, 23, 65535));
        assert_eq(major, 258);
        assert_eq(minor, 23);
        assert_eq(patch, 65535);
    }

    #[test(should_fail_with = "malformed circuits version")]
    fn rejects_bits_below_the_patch() {
        let _ = unpack_circuit_version(circuit_version(0, 23, 0) + 1);
    }

    #[test]
    fn accepts_a_0_23_release_at_or_above_the_minimum() {
        assert_circuit_version_supported(circuit_version(0, 23, 0), MIN_SUPPORTED_CIRCUIT_VERSION);
        assert_circuit_version_supported(circuit_version(0, 23, 4), MIN_SUPPORTED_CIRCUIT_VERSION);
        assert_circuit_version_supported(circuit_version(0, 23, 4), circuit_version(0, 23, 4));
        assert_circuit_version_supported(circuit_version(0, 23, 4), circuit_version(0, 22, 9));
    }

    #[test(should_fail_with = "circuits version older than the service accepts")]
    fn rejects_a_release_older_than_the_minimum() {
        assert_circuit_version_supported(circuit_version(0, 23, 1), circuit_version(0, 23, 2));
    }

    #[test(should_fail_with = "unsupported circuits version")]
    fn rejects_an_older_layout() {
        assert_circuit_version_supported(circuit_version(0, 22, 0), circuit_version(0, 22, 0));
    }

    #[test(should_fail_with = "unsupported circuits version")]
    fn rejects_a_newer_layout_even_above_the_minimum() {
        assert_circuit_version_supported(circuit_version(0, 24, 0), MIN_SUPPORTED_CIRCUIT_VERSION);
    }
}
