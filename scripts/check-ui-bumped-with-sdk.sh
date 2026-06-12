#!/bin/bash

# Enforce the UI/SDK release coupling policy.
#
# @zkpassport/ui bundles @zkpassport/sdk as a regular dependency, so an SDK
# release that changes behavior must ship a new UI release too — otherwise the
# published UI keeps pointing at the old SDK range. We do NOT require the two
# version numbers to be equal; we only require that when the SDK version
# changes relative to the base branch, the UI version changes as well.

set -e

BASE_REF="${1:-origin/main}"

# Read a package.json version at a given git ref; prints nothing on failure.
version_at_ref() {
    local ref="$1" path="$2"
    git show "$ref:$path" 2>/dev/null \
        | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).version)}catch(e){}})"
}

# Make sure the base ref is available (no-op if already fetched / offline).
git fetch --quiet origin main 2>/dev/null || true

SDK_NOW=$(node -p "require('./packages/zkpassport-sdk/package.json').version")
UI_NOW=$(node -p "require('./packages/zkpassport-ui/package.json').version")

SDK_BASE=$(version_at_ref "$BASE_REF" "packages/zkpassport-sdk/package.json")
UI_BASE=$(version_at_ref "$BASE_REF" "packages/zkpassport-ui/package.json")

if [ -z "$SDK_BASE" ] || [ -z "$UI_BASE" ]; then
    echo "Could not resolve base versions from '$BASE_REF'; skipping UI/SDK bump check."
    exit 0
fi

if [ "$SDK_NOW" != "$SDK_BASE" ] && [ "$UI_NOW" = "$UI_BASE" ]; then
    echo "ERROR: @zkpassport/sdk was bumped ($SDK_BASE -> $SDK_NOW) but @zkpassport/ui was not (still $UI_NOW)."
    echo "@zkpassport/ui bundles the SDK, so it must be republished when the SDK changes."
    echo "Bump packages/zkpassport-ui/package.json version (any bump — it need not match the SDK)."
    exit 1
fi

echo "OK: UI/SDK bump policy satisfied (SDK $SDK_BASE -> $SDK_NOW, UI $UI_BASE -> $UI_NOW)."
