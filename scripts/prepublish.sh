#!/bin/bash

# Prepublish script for all TS lib packages
# This script should only be called from package prepublish hooks

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"

# Ensure script is being run with `bun publish` (not `npm publish`)
# This is because bun publish resolves workspace:* refs, whereas npm publish does not
if [ -z "$CI" ]; then
  bun -e "process.env.npm_config_user_agent?.startsWith('bun/') || (console.error('ERROR: Must use bun publish'), process.exit(1))"
fi

# Check for prerelease version accidentally being published to 'latest' tag
if [ -z "$CI" ]; then
  "$REPO_ROOT/scripts/check-prerelease-tag.sh"
fi

# Sync workspace dependencies
(cd "$REPO_ROOT" && scripts/sync-workspace-deps.sh)

# Build and test all packages
echo "📦 Building all packages..."
(cd "$REPO_ROOT" && bun run clean && bun run build && bun run check && bun run test)

# Validate package
bun run validate-package
