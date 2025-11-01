#!/bin/bash

set -e

# Ensure bun.lock contains the latest workspace dependency versions
# This is what `bun publish` uses when replacing "workspace:*" in package.json
(cd packages/zkpassport-sdk && bun update @zkpassport/registry @zkpassport/utils)
(cd packages/registry-sdk && bun update @zkpassport/utils)

# Check mode for CI: verify that workspace dependencies are synced
# If bun.lock has changed, then the dependencies are not synced
if [ "$1" = "check" ] && ! git diff --exit-code bun.lock; then
    echo "Error: Workspace dependencies are not synced"
    echo "Run scripts/sync-workspace-deps.sh to sync workspace dependencies"
    exit 1
fi
