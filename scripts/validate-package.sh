#!/bin/bash

# Package validation script
# Validates an already-built package using publint and @arethetypeswrong/cli
# This script should be called from package prepublish hooks after building

set -e

echo "🔍 Validating package..."

# Pack the package
echo "📦 Packing package..."
PKG=$(bun pm pack --quiet | xargs)
trap 'rm "$PKG"' EXIT

# Run publint validation
echo "🔍 Running publint..."
bunx publint "$PKG"

# Run @arethetypeswrong/cli validation
echo "🔍 Running @arethetypeswrong/cli..."
bunx @arethetypeswrong/cli "$PKG" --profile node16 -f table-flipped

echo "✅ Package validation complete: $PKG"
