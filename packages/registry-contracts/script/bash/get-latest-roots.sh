#!/bin/zsh

set -e

export CHAIN_ID=${CHAIN_ID:-31337}
export RPC_URL=${RPC_URL:-http://localhost:8545}

CERTIFICATE_REGISTRY_ID=0x0000000000000000000000000000000000000000000000000000000000000001
CIRCUIT_REGISTRY_ID=0x0000000000000000000000000000000000000000000000000000000000000002
SANCTIONS_REGISTRY_ID=0x0000000000000000000000000000000000000000000000000000000000000003

ROOT_REGISTRY_ADDRESS=$(cat broadcast/DeployRootRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "Using Root Registry at: $ROOT_REGISTRY_ADDRESS"

LATEST_ROOT=$(cast call $ROOT_REGISTRY_ADDRESS "latestRoot(bytes32)" $CERTIFICATE_REGISTRY_ID --rpc-url $RPC_URL)
echo "Certificate Registry latest root: $LATEST_ROOT"

LATEST_ROOT=$(cast call $ROOT_REGISTRY_ADDRESS "latestRoot(bytes32)" $CIRCUIT_REGISTRY_ID --rpc-url $RPC_URL)
echo "Circuit Registry latest root: $LATEST_ROOT"

LATEST_ROOT=$(cast call $ROOT_REGISTRY_ADDRESS "latestRoot(bytes32)" $SANCTIONS_REGISTRY_ID --rpc-url $RPC_URL)
echo "Sanctions Registry latest root: $LATEST_ROOT"

REGISTRY_HELPER_ADDRESS=$(cat broadcast/DeployRegistryHelper.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "Using Registry Helper at: $REGISTRY_HELPER_ADDRESS"

LATEST_ROOT=$(cast call $REGISTRY_HELPER_ADDRESS "getLatestRootDetails(bytes32)" $CERTIFICATE_REGISTRY_ID --rpc-url $RPC_URL)
echo "Certificate Registry latest root (via RegistryHelper): $LATEST_ROOT"
