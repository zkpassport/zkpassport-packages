#!/bin/bash
set -e

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
