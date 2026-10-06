#!/bin/sh
# Builds libzkpassport_ffi.a for iOS device + simulator.
# Output: rust/target/<triple>/release/libzkpassport_ffi.a
set -e
cd "$(dirname "$0")/.."
rustup target add aarch64-apple-ios aarch64-apple-ios-sim 2>/dev/null || true
cargo build -p zkpassport-ffi --release --target aarch64-apple-ios
cargo build -p zkpassport-ffi --release --target aarch64-apple-ios-sim
echo "device:    $(pwd)/target/aarch64-apple-ios/release/libzkpassport_ffi.a"
echo "simulator: $(pwd)/target/aarch64-apple-ios-sim/release/libzkpassport_ffi.a"
