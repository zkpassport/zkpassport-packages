#!/bin/bash

# Sync workspace dependencies
# This script ensures bun.lock contains the latest workspace dependency versions
# This is what `bun publish` uses when replacing "workspace:*" in package.json

set -e

echo "Ensuring workspace dependencies are synced"
(cd packages/zkpassport-sdk && bun update @zkpassport/utils @zkpassport/registry)
(cd packages/registry-sdk && bun update @zkpassport/utils)

# Check mode for CI: verify that workspace dependencies are synced
# If bun.lock has changed, then the dependencies are not synced
if [ "$1" = "check" ] && ! git diff --exit-code bun.lock; then
    echo "Error: Workspace dependencies are not synced"
    echo "Run ./scripts/sync-workspace-deps.sh to sync workspace dependencies"
    exit 1
fi
