#!/bin/bash

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
    kill $ANVIL_PID 2>/dev/null
    exit 0
}
trap cleanup EXIT SIGINT SIGTERM

# Wait a moment for anvil to fully start
sleep 1

# Run the deployment scripts
./script/bash/deploy.sh
./script/bash/update-roots.sh

echo "Deployment complete!"

# Bring anvil to foreground by waiting for it
wait $ANVIL_PID
