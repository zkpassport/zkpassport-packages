#!/bin/bash

# Test deployment script for integration tests
# ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION ⚠️
# This script deploys contracts to a local Anvil instance for testing purposes

set -e

# Hardcoded for test environment
export CHAIN_ID=31337
export RPC_URL=${RPC_URL:-http://localhost:8545}
export ETHERSCAN_API_KEY=${ETHERSCAN_API_KEY:-dummy}

export DEPLOYER_ADDRESS=${DEPLOYER_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export DEPLOYER_PRIVATE_KEY=${DEPLOYER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

export ROOT_REGISTRY_ADMIN_ADDRESS=${ROOT_REGISTRY_ADMIN_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export ROOT_REGISTRY_ADMIN_PRIVATE_KEY=${ROOT_REGISTRY_ADMIN_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}

export ROOT_REGISTRY_GUARDIAN_ADDRESS=${ROOT_REGISTRY_GUARDIAN_ADDRESS:-0x0000000000000000000000000000000000000000}

export CERTIFICATE_REGISTRY_ADMIN_ADDRESS=${CERTIFICATE_REGISTRY_ADMIN_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export CERTIFICATE_REGISTRY_ADMIN_PRIVATE_KEY=${CERTIFICATE_REGISTRY_ADMIN_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
export CERTIFICATE_REGISTRY_ORACLE_ADDRESS=${CERTIFICATE_REGISTRY_ORACLE_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}
export CERTIFICATE_REGISTRY_ORACLE_PRIVATE_KEY=${CERTIFICATE_REGISTRY_ORACLE_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}

export CIRCUIT_REGISTRY_ADMIN_ADDRESS=${CIRCUIT_REGISTRY_ADMIN_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export CIRCUIT_REGISTRY_ADMIN_PRIVATE_KEY=${CIRCUIT_REGISTRY_ADMIN_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
export CIRCUIT_REGISTRY_ORACLE_ADDRESS=${CIRCUIT_REGISTRY_ORACLE_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}
export CIRCUIT_REGISTRY_ORACLE_PRIVATE_KEY=${CIRCUIT_REGISTRY_ORACLE_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}

export SANCTIONS_REGISTRY_ADMIN_ADDRESS=${SANCTIONS_REGISTRY_ADMIN_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}
export SANCTIONS_REGISTRY_ADMIN_PRIVATE_KEY=${SANCTIONS_REGISTRY_ADMIN_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
export SANCTIONS_REGISTRY_ORACLE_ADDRESS=${SANCTIONS_REGISTRY_ORACLE_ADDRESS:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}
export SANCTIONS_REGISTRY_ORACLE_PRIVATE_KEY=${SANCTIONS_REGISTRY_ORACLE_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}

REGISTRY_ID_CERTIFICATE_REGISTRY=0x0000000000000000000000000000000000000000000000000000000000000001
REGISTRY_ID_CIRCUIT_REGISTRY=0x0000000000000000000000000000000000000000000000000000000000000002
REGISTRY_ID_SANCTIONS_REGISTRY=0x0000000000000000000000000000000000000000000000000000000000000003

# Deploy the RootRegistry contract
echo "Deploying RootRegistry..."
forge script script/DeployRootRegistry.s.sol:DeployRootRegistryScript --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
export ROOT_REGISTRY_ADDRESS=$(cat broadcast/DeployRootRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "RootRegistry deployed at: $ROOT_REGISTRY_ADDRESS"

# Deploy the RegistryHelper contract
echo "Deploying RegistryHelper..."
forge script script/DeployRegistryHelper.s.sol:DeployRegistryHelperScript --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
REGISTRY_HELPER_ADDRESS=$(cat broadcast/DeployRegistryHelper.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "RegistryHelper deployed at: $REGISTRY_HELPER_ADDRESS"

# Deploy the CertificateRegistry contract
echo "Deploying CertificateRegistry..."
forge script script/DeployCertificateRegistry.s.sol:DeployCertificateRegistryScript --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
CERTIFICATE_REGISTRY_ADDRESS=$(cat broadcast/DeployCertificateRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "CertificateRegistry deployed at: $CERTIFICATE_REGISTRY_ADDRESS"
# Add the CertificateRegistry address to the RootRegistry
cast send $ROOT_REGISTRY_ADDRESS "addRegistry(bytes32,address)" $REGISTRY_ID_CERTIFICATE_REGISTRY $CERTIFICATE_REGISTRY_ADDRESS --rpc-url $RPC_URL --private-key $ROOT_REGISTRY_ADMIN_PRIVATE_KEY
# Verify it's added to the RootRegistry
CHECK_CERTIFICATE_REGISTRY_ADDRESS=$(cast call $ROOT_REGISTRY_ADDRESS "registries(bytes32)" $REGISTRY_ID_CERTIFICATE_REGISTRY --rpc-url $RPC_URL)
echo "Checked CertificateRegistry address: $CHECK_CERTIFICATE_REGISTRY_ADDRESS"

# Deploy the CircuitRegistry contract
echo "Deploying CircuitRegistry..."
forge script script/DeployCircuitRegistry.s.sol:DeployCircuitRegistryScript --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
CIRCUIT_REGISTRY_ADDRESS=$(cat broadcast/DeployCircuitRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "CircuitRegistry deployed at: $CIRCUIT_REGISTRY_ADDRESS"
# Add the CircuitRegistry address to the RootRegistry
cast send $ROOT_REGISTRY_ADDRESS "addRegistry(bytes32,address)" $REGISTRY_ID_CIRCUIT_REGISTRY $CIRCUIT_REGISTRY_ADDRESS --rpc-url $RPC_URL --private-key $ROOT_REGISTRY_ADMIN_PRIVATE_KEY
# Verify it's added to the RootRegistry
CHECK_CIRCUIT_REGISTRY_ADDRESS=$(cast call $ROOT_REGISTRY_ADDRESS "registries(bytes32)" $REGISTRY_ID_CIRCUIT_REGISTRY --rpc-url $RPC_URL)
echo "Checked CircuitRegistry address: $CHECK_CIRCUIT_REGISTRY_ADDRESS"

# Deploy the SanctionsRegistry contract
echo "Deploying SanctionsRegistry..."
forge script script/DeploySanctionsRegistry.s.sol:DeploySanctionsRegistryScript --rpc-url $RPC_URL --private-key $DEPLOYER_PRIVATE_KEY --broadcast
SANCTIONS_REGISTRY_ADDRESS=$(cat broadcast/DeploySanctionsRegistry.s.sol/$CHAIN_ID/run-latest.json | jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress')
echo "SanctionsRegistry deployed at: $SANCTIONS_REGISTRY_ADDRESS"
# Add the SanctionsRegistry address to the RootRegistry
cast send $ROOT_REGISTRY_ADDRESS "addRegistry(bytes32,address)" $REGISTRY_ID_SANCTIONS_REGISTRY $SANCTIONS_REGISTRY_ADDRESS --rpc-url $RPC_URL --private-key $ROOT_REGISTRY_ADMIN_PRIVATE_KEY
# Verify it's added to the RootRegistry
CHECK_SANCTIONS_REGISTRY_ADDRESS=$(cast call $ROOT_REGISTRY_ADDRESS "registries(bytes32)" $REGISTRY_ID_SANCTIONS_REGISTRY --rpc-url $RPC_URL)
echo "Checked SanctionsRegistry address: $CHECK_SANCTIONS_REGISTRY_ADDRESS"

