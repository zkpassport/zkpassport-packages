#!/bin/bash

# Prepublish script for all TS lib packages
# This script should only be called from package prepublish hooks

set -e

# Block direct publish — must use `bun pack` then `npm publish <tarball>`
# (bun pack resolves workspace:* refs, npm publish handles OIDC provenance)
node -e "
  if (process.env.npm_command === 'publish') {
    console.error('ERROR: Direct publish is not allowed.');
    console.error('Use: bun pack && npm publish <tarball> --provenance --access public');
    process.exit(1);
  }
"

# Check for prerelease version accidentally being published to 'latest' tag
../../scripts/check-prerelease-tag.sh

# Sync workspace dependencies
(cd $(git rev-parse --show-toplevel) && scripts/sync-workspace-deps.sh)

# Build and test all packages
echo "📦 Building all packages..."
(cd ../.. && bun run clean && bun run build && bun run check && bun run test)

# Validate package
../../scripts/validate-package.sh
