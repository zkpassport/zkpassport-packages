#!/bin/bash

set -e

# Require bun publish
bun -e "process.env.npm_config_user_agent?.startsWith('bun/') || (console.error('Must use bun publish'), process.exit(1))"

# Build zkpassport-utils
cd ../zkpassport-utils
bun run check && bun run test && bun run build
cd -

# Build registry-sdk
cd ../registry-sdk
bun run check && bun run test && bun run build
cd -

# Check, test and build package
bun run check && bun run test && bun run build
