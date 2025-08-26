#!/bin/zsh

set -e

export CHAIN_ID=${CHAIN_ID:-31337}
export RPC_URL=${RPC_URL:-http://localhost:8545}
export ETHERSCAN_API_KEY=${ETHERSCAN_API_KEY:-dummy}

export ORACLE_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export ORACLE_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
export CERTIFICATE_REGISTRY_ROOT=${CERTIFICATE_REGISTRY_ROOT:-0x03c239fdfafd89a568efac9175c32b998e208c4ab453d3615a31c83e65c90686}
export CIRCUIT_REGISTRY_ROOT=${CIRCUIT_REGISTRY_ROOT:-0x068f6e356f993bd2afaf3d3466efff1dd4bc06f61952ac336085b832b93289a7}
export SANCTIONS_REGISTRY_ROOT=${SANCTIONS_REGISTRY_ROOT:-0x0bb47c10011708980491486b3b30ac8bbd1f84465d35739a23d4c7cac5c070ef} # Root is default OFAC list

# Function to generate SHA-256 hash that works on both macOS and Linux
generate_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    echo -n "$1" | shasum -a 256 | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    echo -n "$1" | sha256sum | awk '{print $1}'
  else
    echo "Error: No SHA-256 hashing utility found"
    exit 1
  fi
}

CERTIFICATE_REGISTRY_ADDRESS=$(cat broadcast/DeployCertificateRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "Using CertificateRegistry address: $CERTIFICATE_REGISTRY_ADDRESS"

echo "Creating Certificate Registry historical roots..."

# Loop to create 10 roots
for i in {1..10}
do
  # Generate a SHA-256 hash for the root
  ROOT="0x$(generate_sha256 "$i")"
  # Generate a SHA-256 hash for CID (simulating IPFS CID)
  CID="0x$(generate_sha256 "$i")"
  # Calculate a simulated leaves count - each root has i*100 certificates
  LEAVES_COUNT=$((i * 100))

  # Use the certificates fixture root hash and cid for the last root update
  if [ $i -eq 10 ]; then
    ROOT=$CERTIFICATE_REGISTRY_ROOT
    CID="0x2faca44e2b6e4e88a8bbba15bc53b0a7604b693c7733d3d4995c445b5a6258a2" # QmRYkZEm7ueX8XT82QuYTdL6iivv3gryoi2jJsPzvsdu6H
    LEAVES_COUNT=5
  fi

  # Call updateRoot as oracle with the generated root, cid, and leaves count
  cast send $CERTIFICATE_REGISTRY_ADDRESS "updateRoot(bytes32,uint256,bytes32)" $ROOT $LEAVES_COUNT $CID --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY > /dev/null

  # If this is the 5th root (i=5), revoke it immediately after creating it
  if [ $i -eq 5 ]; then
    echo "Revoking root #$i: $ROOT"
    cast send $CERTIFICATE_REGISTRY_ADDRESS "setRevocationStatus(bytes32,bool)" $ROOT true --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY > /dev/null
  fi
done

CIRCUIT_REGISTRY_ADDRESS=$(cat broadcast/DeployCircuitRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "Using CircuitRegistry address: $CIRCUIT_REGISTRY_ADDRESS"

echo "Creating Circuit Registry historical roots..."

# Loop to create 10 roots
for i in {1..10}
do
  # Generate a SHA-256 hash for the root
  ROOT="0x$(generate_sha256 "$i")"
  # Generate a SHA-256 hash for CID (simulating IPFS CID)
  CID="0x$(generate_sha256 "$i")"
  # Calculate a simulated leaves count - each root has i*100 certificates
  LEAVES_COUNT=$((i * 100))

  # Use the circuit manifest fixture root hash and cid for the last root update
  if [ $i -eq 10 ]; then
    ROOT=$CIRCUIT_REGISTRY_ROOT
    CID="0xc49583d83cde885ac798b7bd39f9910ba72b72faf27cbda4a5fcf951c3282019" # bafybeigeswb5qpg6rbnmpgfxxu47teilu4vxf6xsps62jjp47fi4gkbade
    LEAVES_COUNT=5
  fi

  # Call updateRoot as oracle with the generated root, cid, and leaves count
  cast send $CIRCUIT_REGISTRY_ADDRESS "updateRoot(bytes32,uint256,bytes32)" $ROOT $LEAVES_COUNT $CID --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY > /dev/null

  # If this is the 5th root (i=5), revoke it immediately after creating it
  if [ $i -eq 5 ]; then
    echo "Revoking root #$i: $ROOT"
    cast send $CIRCUIT_REGISTRY_ADDRESS "setRevocationStatus(bytes32,bool)" $ROOT true --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY > /dev/null
  fi
done

SANCTIONS_REGISTRY_ADDRESS=$(cat broadcast/DeploySanctionsRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "Using SanctionsRegistry address: $SANCTIONS_REGISTRY_ADDRESS"

echo "Creating Sanctions Registry historical roots..."

# Loop to create 10 roots
for i in {1..10}
do
  # Generate a SHA-256 hash for the root
  ROOT="0x$(generate_sha256 "$i")"
  # Generate a SHA-256 hash for CID (simulating IPFS CID)
  CID="0x$(generate_sha256 "$i")"
  # Calculate a simulated leaves count - each root has i*100 certificates
  LEAVES_COUNT=$((i * 100))

  # Use the circuit manifest fixture root hash and cid for the last root update
  if [ $i -eq 10 ]; then
    ROOT=$SANCTIONS_REGISTRY_ROOT
    # Note(md): for now this CID is the same as the certificate registry root CID above, and is not real
    CID="0x2faca44e2b6e4e88a8bbba15bc53b0a7604b693c7733d3d4995c445b5a6258a2" # QmRYkZEm7ueX8XT82QuYTdL6iivv3gryoi2jJsPzvsdu6H
    LEAVES_COUNT=5
  fi

  # Call updateRoot as oracle with the generated root, cid, and leaves count
  cast send $SANCTIONS_REGISTRY_ADDRESS "updateRoot(bytes32,uint256,bytes32)" $ROOT $LEAVES_COUNT $CID --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY > /dev/null

  # If this is the 5th root (i=5), revoke it immediately after creating it
  if [ $i -eq 5 ]; then
    echo "Revoking root #$i: $ROOT"
    cast send $SANCTIONS_REGISTRY_ADDRESS "setRevocationStatus(bytes32,bool)" $ROOT true --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY > /dev/null
  fi
done