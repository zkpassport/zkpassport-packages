#!/bin/bash

# Prepublish script for all TS lib packages
# This script should only be called from package prepublish hooks

set -e

# Ensure script is being run with `bun publish` (not `npm publish`)
bun -e "process.env.npm_config_user_agent?.startsWith('bun/') || (console.error('ERROR: Must use bun publish'), process.exit(1))"

# Check for prerelease version accidentally being published to 'latest' tag
../../scripts/check-prerelease-tag.sh

# Sync workspace dependencies
(cd $(git rev-parse --show-toplevel) && scripts/sync-workspace-deps.sh)
