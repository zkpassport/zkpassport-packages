#!/bin/bash
set -e

# Go to monorepo root
cd $(git rev-parse --show-toplevel)

# Install at root
bun install --frozen-lockfile

# Build registry-sdk
cd packages/registry-sdk
bun run build

# Build the web app
cd ../registry-explorer
bun run build
