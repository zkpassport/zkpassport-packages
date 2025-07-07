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
