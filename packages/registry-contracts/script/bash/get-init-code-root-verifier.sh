#!/bin/bash

set -e

# Configuration
CONTRACT_NAME="RootVerifier"
CONSTRUCTOR_SIGNATURE="constructor(address,address,address)"
ADMIN="0x2000ab040a899f914D6DfD2457C3dFBB22d4c762"
GUARDIAN="0x0000000000000000000000000000000000000000"
ROOT_REGISTRY="0x1D0000020038d6E40E1d98e09fA1bb3A7DAA8B70"
ARGS=("$ADMIN" "$GUARDIAN" "$ROOT_REGISTRY")

echo "Contract name: $CONTRACT_NAME"
echo "Constructor sig: $CONSTRUCTOR_SIGNATURE"
echo "Constructor args: ${ARGS[@]}"
echo
echo "Admin: $ADMIN"
echo "Guardian: $GUARDIAN"
echo "RootRegistry: $ROOT_REGISTRY"
echo
echo "Calculating init code..."

echo "Encoding constructor args: cast abi-encode \"$CONSTRUCTOR_SIGNATURE\" \"${ARGS[@]}\""
CONSTRUCTOR_ARGS=$(cast abi-encode "$CONSTRUCTOR_SIGNATURE" "${ARGS[@]}")
echo "Constructor args (ABI encoded): $CONSTRUCTOR_ARGS"

echo "Getting contract bytecode..."
forge build --force src/$CONTRACT_NAME.sol
BYTECODE=$(forge inspect $CONTRACT_NAME bytecode)

echo "Combining bytecode with constructor args..."
INIT_CODE="${BYTECODE}${CONSTRUCTOR_ARGS:2}"
INIT_CODE_HASH=$(cast keccak $INIT_CODE)

echo "Init code: $INIT_CODE"
echo "Init code hash: $INIT_CODE_HASH"

EXPECTED_INIT_CODE_HASH="0xf3fd822c2cb27cea5f246e0742385b562b64ebb12e0818d18185072fb22961b0"
# Error if INIT_CODE_HASH not equal to expected hash
if [ "$INIT_CODE_HASH" != "$EXPECTED_INIT_CODE_HASH" ]; then
    echo "Error: Init code hash does not match expected hash"
    exit 1
else
    echo "Init code hash MATCHES expected hash!"
fi
