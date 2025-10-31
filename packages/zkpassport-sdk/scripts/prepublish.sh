#!/bin/bash

set -e

# Run shared prepublish checks
../../scripts/prepublish.sh

# Build and test all packages
echo "📦 Building all packages..."
cd ../..
bun run clean
bun run build
bun run check
bun run test
cd -

# Validate package
../../scripts/validate-package.sh
