#!/bin/bash

# Package validation script
# Validates an already-built package using publint and @arethetypeswrong/cli
# This script should be called from package prepublish hooks after building

set -e

echo "🔍 Validating package..."

# Pack the package
echo "📦 Packing package..."
PKG=$(npm pack --silent)

# Run publint validation
echo "🔍 Running publint..."
npx publint "$PKG"

# Run @arethetypeswrong/cli validation
echo "🔍 Running @arethetypeswrong/cli..."
npx @arethetypeswrong/cli "$PKG"

echo "✅ Package validation complete: $PKG"

