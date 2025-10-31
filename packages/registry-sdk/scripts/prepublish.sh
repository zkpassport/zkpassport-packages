#!/bin/bash

set -e

# Run shared prepublish checks
../../scripts/prepublish.sh

# Sync workspace dependencies
cd ../..
./scripts/sync-workspace-deps.sh
cd -

# Build zkpassport-utils first
cd ../zkpassport-utils
bun run check && bun run test && bun run build
cd -

# Check, test and build package
bun run check && bun run test && bun run build
