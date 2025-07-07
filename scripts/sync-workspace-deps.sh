#!/bin/bash

set -e

# Ensure bun.lock uses latest workspace dependency versions
# This is what bun publish uses when replacing "workspace:*" in package.json
cd packages/zkpassport-sdk
bun update @zkpassport/registry @zkpassport/utils
cd -
cd packages/registry-sdk
bun update @zkpassport/utils
cd -

# Check mode for CI: verify if workspace dependencies are synced
if [ "$1" = "check" ] && ! git diff --exit-code bun.lock; then
    echo "Error: Workspace dependencies are not synced"
    echo "Run scripts/sync-workspace-deps.sh to sync workspace dependencies"
    exit 1
fi
