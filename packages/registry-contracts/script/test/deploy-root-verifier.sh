#!/bin/bash

# Test deployment script for RootVerifier, SubVerifier, VerifierHelper, and ProofVerifiers
# ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION ⚠️
# This script deploys all verifier contracts to a local Anvil instance
# Expects ROOT_REGISTRY_ADDRESS to already be deployed (run deploy-root-registry.sh first)

set -e

# Hardcoded for test environment
export CHAIN_ID=31337
export RPC_URL=${RPC_URL:-http://localhost:8545}

export DEPLOYER_PRIVATE_KEY=${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

export ROOT_VERIFIER_ADMIN_ADDRESS=${ROOT_VERIFIER_ADMIN_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export ROOT_VERIFIER_GUARDIAN_ADDRESS=${ROOT_VERIFIER_GUARDIAN_ADDRESS:-0x0000000000000000000000000000000000000000}

if [ -z "$ROOT_REGISTRY_ADDRESS" ]; then
  echo "Error: ROOT_REGISTRY_ADDRESS must be set"
  echo "Deploy the registry contracts first with deploy-root-registry.sh and export ROOT_REGISTRY_ADDRESS"
  exit 1
fi

# Deploy all verifier contracts (RootVerifier + VerifierHelper + SubVerifier + proof verifiers)
echo "Deploying ZKPassport verifier stack..."
forge script script/DeployRootVerifier.s.sol:DeployRootVerifierScript \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast

# Extract the RootVerifier address (first CREATE transaction)
export ROOT_VERIFIER_ADDRESS=$(cat broadcast/DeployRootVerifier.s.sol/$CHAIN_ID/run-latest.json | jq -r '[.transactions[] | select(.transactionType=="CREATE")][0].contractAddress')
echo ""
echo "RootVerifier deployed at: $ROOT_VERIFIER_ADDRESS"

# Verify deployment
VERIFIER_ADMIN=$(cast call $ROOT_VERIFIER_ADDRESS "admin()" --rpc-url $RPC_URL)
echo "Verified admin: $VERIFIER_ADMIN"

VERIFIER_REGISTRY=$(cast call $ROOT_VERIFIER_ADDRESS "rootRegistry()" --rpc-url $RPC_URL)
echo "Verified rootRegistry: $VERIFIER_REGISTRY"

SUBVERIFIER_COUNT=$(cast call $ROOT_VERIFIER_ADDRESS "subverifierCount()" --rpc-url $RPC_URL)
echo "Verified subverifierCount: $SUBVERIFIER_COUNT"

HELPER_COUNT=$(cast call $ROOT_VERIFIER_ADDRESS "helperCount()" --rpc-url $RPC_URL)
echo "Verified helperCount: $HELPER_COUNT"

# Check for deployment artifact
if [ -f deployments/addresses-$CHAIN_ID.json ]; then
  echo ""
  echo "Deployment artifact written to deployments/addresses-$CHAIN_ID.json"
fi
