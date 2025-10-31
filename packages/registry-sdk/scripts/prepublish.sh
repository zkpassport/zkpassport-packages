#!/bin/bash

set -e

# Run shared prepublish checks
../../scripts/prepublish.sh

# Sync workspace dependencies and clean all builds
cd ../..
./scripts/sync-workspace-deps.sh
bun run clean
cd -

# Build zkpassport-utils first
cd ../zkpassport-utils
bun run check && bun run test && bun run build
cd -

# Check, test and build package
bun run check && bun run test && bun run build

# Validate package
../../scripts/validate-package.sh
