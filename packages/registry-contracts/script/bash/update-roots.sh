#!/bin/zsh

set -e

export CHAIN_ID=${CHAIN_ID:-31337}
export RPC_URL=${RPC_URL:-http://localhost:8545}
export ETHERSCAN_API_KEY=${ETHERSCAN_API_KEY:-dummy}

export ORACLE_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export ORACLE_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

CERTIFICATE_REGISTRY_ADDRESS=$(cat broadcast/DeployCertificateRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "Using CertificateRegistry address: $CERTIFICATE_REGISTRY_ADDRESS"

echo "Creating historical roots..."

# Loop to create 10 roots
for i in {1..10}
do
  # Generate a SHA-256 hash for the root
  ROOT="0x$(echo -n "$i" | shasum -a 256 | awk '{print $1}')"
  # Generate a SHA-256 hash for CID (simulating IPFS CID)
  CID="0x$(echo -n "$i" | shasum -a 256 | awk '{print $1}')"
  # Calculate a simulated leaves count - each root has i*100 certificates
  LEAVES_COUNT=$((i * 100))

  # Use the certificates fixture root hash and cid for the last root update
  if [ $i -eq 10 ]; then
    ROOT="0x15db8c75a3eb23f2d87ad299a8a4263cdb630e59be154b8db9864911db507681"
    CID="0xfa6c339b71fb02830ea53b4406e1f9911cf0952dee71a9b131c7d04f1948c52a" # bafkreih2nqzzw4p3akbq5jj3iqdod6mrdtyjklpoogu3cmoh2bhrssgffi
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
