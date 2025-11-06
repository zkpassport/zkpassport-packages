#!/bin/bash

# Local test environment setup
# ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION ⚠️
# This script starts a local Anvil node and deploys contracts for manual testing

# Ensure the script is run from the contracts directory
if [ $(basename "$(pwd)") != "registry-contracts" ]; then
  echo "Error: This script must be run from the registry-contracts directory."
  exit 1
fi

# Start anvil in the background
anvil &
ANVIL_PID=$!

# Ensure anvil is killed when the script exits or when Ctrl+C is pressed
cleanup() {
    echo "Stopping Anvil..."
    kill $ANVIL_PID 2>/dev/null
    exit 0
}
trap cleanup EXIT SIGINT SIGTERM

# Wait a moment for anvil to fully start
sleep 1

# Run the deployment and seeding scripts
./script/test/deploy.sh
./script/test/seed-registries.sh

echo "Test environment ready!"
echo "Anvil is running on http://localhost:8545 (Chain ID: 31337)"
echo "Press Ctrl+C to stop..."

# Bring anvil to foreground by waiting for it
wait $ANVIL_PID

