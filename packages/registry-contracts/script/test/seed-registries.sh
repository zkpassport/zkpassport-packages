#!/bin/bash

# Test seed script for integration tests
# ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION ⚠️
# This script seeds registry instances with historical roots for testing purposes

set -e

# Hardcoded for test environment
export CHAIN_ID=31337
export RPC_URL=${RPC_URL:-http://localhost:8545}
export ETHERSCAN_API_KEY=${ETHERSCAN_API_KEY:-dummy}

export ORACLE_ADDRESS=${ORACLE_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}
export ORACLE_PRIVATE_KEY=${ORACLE_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}
export CERTIFICATE_REGISTRY_ROOT=${CERTIFICATE_REGISTRY_ROOT:-0x2b49d7ddaec2fa540efec3311af6223cfd19d3a9e9314e10039f9fae0747f062}
export CIRCUIT_REGISTRY_ROOT=${CIRCUIT_REGISTRY_ROOT:-0x068f6e356f993bd2afaf3d3466efff1dd4bc06f61952ac336085b832b93289a7}
export SANCTIONS_REGISTRY_ROOT=${SANCTIONS_REGISTRY_ROOT:-0x099699583ea7729a4a05821667645e927b74feb4e6e5382c6e4370e35ed2b23c}

# Read registry addresses from broadcast files
export CERTIFICATE_REGISTRY_ADDRESS=$(cat broadcast/DeployCertificateRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
export CIRCUIT_REGISTRY_ADDRESS=$(cat broadcast/DeployCircuitRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
export SANCTIONS_REGISTRY_ADDRESS=$(cat broadcast/DeploySanctionsRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')

# Run the SeedRegistries forge script
forge script script/test/SeedRegistries.s.sol:SeedRegistriesScript --rpc-url $RPC_URL --private-key $ORACLE_PRIVATE_KEY --broadcast

