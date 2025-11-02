#!/bin/bash

# Prepublish checks for all packages
# This script should be called from package prepublish hooks

set -e

# Ensure that the script is being run with bun publish (and not npm publish)
bun -e "process.env.npm_config_user_agent?.startsWith('bun/') || (console.error('ERROR: Must use bun publish'), process.exit(1))"

# Check for prerelease version being published to 'latest' tag
VERSION=$(node -p "require('./package.json').version")

# Detect --tag from command line arguments by searching process tree for bun publish
TAG="${npm_config_tag:-latest}"
BUN_PROCESS=$(ps ax -o pid,command | grep -E "bun.*publish.*--tag" | grep -v grep | head -1 || echo "")
if [[ "$BUN_PROCESS" =~ --tag[=\ ]([a-zA-Z0-9_-]+) ]]; then
  TAG="${BASH_REMATCH[1]}"
fi

if [[ "$VERSION" =~ -([a-zA-Z0-9]+) ]] && [[ "$TAG" == "latest" ]]; then
  echo "ERROR: Attempting to publish prerelease version '$VERSION' to 'latest' tag"
  echo "Prerelease versions should be published with an explicit tag, e.g.:"
  echo "  bun publish --tag beta"
  echo "  bun publish --tag alpha"
  echo "  bun publish --tag next"
  exit 1
fi

(cd ../.. && scripts/sync-workspace-deps.sh)
