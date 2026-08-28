#!/usr/bin/env bash
# Regenerate the proof fixtures consumed by run-harness.sh (and by the TXE tests).
#
# Usage: CIRCUITS_REPO=<circuits checkout> ./generate-proof-fixtures.sh [disclose|age] ...   (default: both)
#
# Why the copy dance: `npx tsx` resolves node_modules from the SCRIPT's directory, and
# generate-proof-fixtures.ts imports the circuits repo's own TS sources (./src/ts/...) relative to its
# own path -- so the generator has to physically live inside the circuits repo while it runs.
# We copy it in under a clearly-named temp name, run it, and delete it again (same trick the
# spike used, just automated). cwd must also be the circuits repo: Circuit.from() resolves
# `target/<name>.json` relative to cwd.
#
# Toolchain: bb 5.0.0-nightly from the 5.0.1 aztec release must be FIRST in PATH -- that is
# the build ZKPassport's production circuits were compiled/proved with. The 5.2.0 bb is used
# only later, by run-harness.sh, to verify the wrapper.
set -euo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
CIRCUITS=${CIRCUITS_REPO:?set CIRCUITS_REPO to a ZKPassport circuits checkout}
AZTEC_501=${AZTEC_501:-$HOME/.aztec/versions/5.0.1}
BB_501_BIN=$AZTEC_501/node_modules/.bin
NARGO_501=$AZTEC_501/bin/aztec-nargo
TMP_SCRIPT=$CIRCUITS/harness-generate-proof-fixtures.tmp.ts

KINDS=("$@")
if [ ${#KINDS[@]} -eq 0 ]; then KINDS=(disclose age); fi

# compare_age is not part of the 5 circuits the spike compiled; build it on demand.
if [ ! -f "$CIRCUITS/target/compare_age.json" ]; then
  echo "== compiling compare_age with $($NARGO_501 --version | head -1)"
  (cd "$CIRCUITS" && $NARGO_501 compile --package compare_age)
fi

cleanup() { rm -f "$TMP_SCRIPT"; }
trap cleanup EXIT

mkdir -p "$HARNESS_DIR/fixtures"
cp "$HARNESS_DIR/generate-proof-fixtures.ts" "$TMP_SCRIPT"

for KIND in "${KINDS[@]}"; do
  OUT=$HARNESS_DIR/fixtures/outer_count_4_$KIND.json
  echo "== generating $KIND fixture -> $OUT"
  (cd "$CIRCUITS" && PATH=$BB_501_BIN:$PATH FIXTURE_KIND=$KIND FIXTURE_OUT=$OUT npx tsx "$TMP_SCRIPT")
done
