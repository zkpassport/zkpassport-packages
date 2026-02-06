#!/bin/bash

# Prepublish script for all TS lib packages
# This script should only be called from package prepublish hooks

set -e

# Ensure script is being run with `bun publish` (not `npm publish`)
# This is because bun publish resolves workspace:* refs, whereas npm publish does not
if [ -z "$CI" ]; then
  bun -e "process.env.npm_config_user_agent?.startsWith('bun/') || (console.error('ERROR: Must use bun publish'), process.exit(1))"
fi

# Check for prerelease version accidentally being published to 'latest' tag
if [ -z "$CI" ]; then
  ../../scripts/check-prerelease-tag.sh
fi

# Sync workspace dependencies
(cd $(git rev-parse --show-toplevel) && scripts/sync-workspace-deps.sh)

# Build and test all packages
echo "📦 Building all packages..."
# (cd ../.. && bun run clean && bun run build && bun run check && bun run test)
bun run build

# Validate package
# ../../scripts/validate-package.sh
