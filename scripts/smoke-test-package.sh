#!/bin/bash

# Installs the packed package into an empty project, with its dependencies
# resolved from npm, and loads every JavaScript entry point it exports with
# both require and import.
# This script should be called from prepublish.sh, after the package is built

set -e

PKG_DIR="$(pwd)"
PKG_NAME=$(bun -p "require('./package.json').name")

# Peer dependencies, optional ones included, as "<name>@<range>" lines
PEERS=()
while read -r PEER; do
  [ -n "$PEER" ] && PEERS+=("$PEER")
done <<< "$(bun -e "
  const { peerDependencies = {} } = require('./package.json')
  for (const [name, range] of Object.entries(peerDependencies)) console.log(name + '@' + range)
")"

echo "📦 Packing package..."
PKG=$(bun pm pack --quiet | xargs)
CONSUMER_DIR=$(mktemp -d)
trap 'rm -rf "$PKG_DIR/$PKG" "$CONSUMER_DIR"' EXIT

echo "📥 Installing $PKG into an empty project..."
cd "$CONSUMER_DIR"
echo '{ "name": "smoke-test", "private": true }' > package.json
npm install --no-audit --no-fund --loglevel=error "$PKG_DIR/$PKG" "${PEERS[@]}"

# One "<require|import> <specifier>" line per condition of each JavaScript export
ENTRY_POINTS=$(bun -e "
  const { exports } = require('./node_modules/$PKG_NAME/package.json')
  for (const [subpath, target] of Object.entries(exports)) {
    const specifier = subpath === '.' ? '$PKG_NAME' : '$PKG_NAME' + subpath.slice(1)
    const conditions = typeof target === 'string'
      ? (/\.[cm]?js$/.test(target) ? ['require', 'import'] : [])
      : ['require', 'import'].filter((condition) => condition in target)
    for (const condition of conditions) console.log(condition + ' ' + specifier)
  }
")

echo "🔍 Loading entry points..."
while read -r CONDITION SPECIFIER; do
  echo "  $CONDITION $SPECIFIER"
  if [ "$CONDITION" = "require" ]; then
    bun -e "require('$SPECIFIER')"
  else
    bun -e "await import('$SPECIFIER')"
  fi
done <<< "$ENTRY_POINTS"

echo "✅ Smoke test complete: $PKG"
