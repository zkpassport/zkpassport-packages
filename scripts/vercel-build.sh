#!/bin/bash
set -e

BUN_VERSION="1.2.22"

# Install bun
curl -fsSL https://bun.com/install | bash -s "bun-v$BUN_VERSION"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo "Using Bun version: $(bun --version)"

# Install at monorepo root
cd $(git rev-parse --show-toplevel)
bun install --frozen-lockfile

# Build zkpassport-utils
cd packages/zkpassport-utils
bun run build
cd -

# Build registry-sdk
cd packages/registry-sdk
bun run build
cd -

# Build the web app
cd packages/registry-explorer
bun run build
