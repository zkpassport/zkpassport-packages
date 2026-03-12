#!/bin/bash

# Test deployment script for the ProtocolController
# ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION ⚠️
# This script deploys the ProtocolController and transfers admin of RootRegistry
# and RootVerifier to the ProtocolController address.
# Expects ROOT_REGISTRY_ADDRESS and ROOT_VERIFIER_ADDRESS to already be set
# (run deploy-root-registry.sh and deploy-root-verifier.sh first)

set -e

# Hardcoded for test environment
export CHAIN_ID=31337
export RPC_URL=${RPC_URL:-http://localhost:8545}

export DEPLOYER_PRIVATE_KEY=${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

export PROTOCOL_CONTROLLER_ADMIN=${PROTOCOL_CONTROLLER_ADMIN:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export ROOT_REGISTRY_OPERATOR_ADDRESS=${ROOT_REGISTRY_OPERATOR_ADDRESS:-0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc}
export ROOT_VERIFIER_OPERATOR_ADDRESS=${ROOT_VERIFIER_OPERATOR_ADDRESS:-0x976EA74026E726554dB657fA54763abd0C3a0aa9}

export ROOT_REGISTRY_ADMIN_PRIVATE_KEY=${ROOT_REGISTRY_ADMIN_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
export ROOT_VERIFIER_ADMIN_PRIVATE_KEY=${ROOT_VERIFIER_ADMIN_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

if [ -z "$ROOT_REGISTRY_ADDRESS" ]; then
  echo "Error: ROOT_REGISTRY_ADDRESS must be set"
  echo "Deploy the registry contracts first with deploy-root-registry.sh and export ROOT_REGISTRY_ADDRESS"
  exit 1
fi

if [ -z "$ROOT_VERIFIER_ADDRESS" ]; then
  echo "Error: ROOT_VERIFIER_ADDRESS must be set"
  echo "Deploy the verifier contracts first with deploy-root-verifier.sh and export ROOT_VERIFIER_ADDRESS"
  exit 1
fi

# Deploy the ProtocolController contract
echo "Deploying ProtocolController..."
forge script script/DeployProtocolController.s.sol:DeployProtocolControllerScript \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast

export PROTOCOL_CONTROLLER_ADDRESS=$(cat broadcast/DeployProtocolController.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo ""
echo "ProtocolController deployed at: $PROTOCOL_CONTROLLER_ADDRESS"

# Transfer RootRegistry admin to the ProtocolController
echo "Transferring RootRegistry admin to ProtocolController..."
cast send $ROOT_REGISTRY_ADDRESS "transferAdmin(address)" $PROTOCOL_CONTROLLER_ADDRESS --rpc-url $RPC_URL --private-key $ROOT_REGISTRY_ADMIN_PRIVATE_KEY

# Transfer RootVerifier admin to the ProtocolController
echo "Transferring RootVerifier admin to ProtocolController..."
cast send $ROOT_VERIFIER_ADDRESS "transferAdmin(address)" $PROTOCOL_CONTROLLER_ADDRESS --rpc-url $RPC_URL --private-key $ROOT_VERIFIER_ADMIN_PRIVATE_KEY

# Verify the admin transfers
REGISTRY_ADMIN=$(cast call $ROOT_REGISTRY_ADDRESS "admin()" --rpc-url $RPC_URL)
echo "RootRegistry admin: $REGISTRY_ADMIN"

VERIFIER_ADMIN=$(cast call $ROOT_VERIFIER_ADDRESS "admin()" --rpc-url $RPC_URL)
echo "RootVerifier admin: $VERIFIER_ADMIN"

CONTROLLER_ADMIN=$(cast call $PROTOCOL_CONTROLLER_ADDRESS "admin()" --rpc-url $RPC_URL)
echo "ProtocolController admin: $CONTROLLER_ADMIN"
