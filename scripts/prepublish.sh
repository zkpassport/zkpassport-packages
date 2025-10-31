#!/bin/bash

# Prepublish checks for all packages
# This script should be called from package prepublish hooks

set -e

# Require bun publish
bun -e "process.env.npm_config_user_agent?.startsWith('bun/') || (console.error('ERROR: Must use bun publish'), process.exit(1))"

# Check for prerelease version being published to 'latest' tag
VERSION=$(node -p "require('./package.json').version")
TAG="${npm_config_tag:-latest}"

if [[ "$VERSION" =~ -([a-zA-Z0-9]+) ]] && [[ "$TAG" == "latest" ]]; then
  echo "ERROR: Attempting to publish prerelease version '$VERSION' to 'latest' tag"
  echo "Prerelease versions should be published with an explicit tag, e.g.:"
  echo "  bun publish --tag beta"
  echo "  bun publish --tag alpha"
  echo "  bun publish --tag next"
  exit 1
fi

