#!/bin/bash

# Package validation script
# Validates an already-built package using publint and @arethetypeswrong/cli
# This script should be called from package prepublish hooks after building

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "🔍 Validating package..."

# Pack the package
echo "📦 Packing package..."
PKG=$(bun pm pack --quiet | xargs)
trap 'rm "$PKG"' EXIT

# Run publint validation
echo "🔍 Running publint..."
"$REPO_ROOT/node_modules/.bin/publint" "$PKG"

# Run @arethetypeswrong/cli validation
echo "🔍 Running @arethetypeswrong/cli..."
"$REPO_ROOT/node_modules/.bin/attw" "$PKG" --profile node16 -f table-flipped

echo "✅ Package validation complete: $PKG"
