#!/usr/bin/env bash
# Regenerate the proof fixtures consumed by test-recursive-verification.sh (and by the TXE tests).
#
# Usage: ./generate-proof-fixtures.sh [disclose|age] ...   (default: both)
#
# The generator imports the circuits repo's TS sources and deps from the `circuits/` submodule
# (pinned to the commit the committed fixtures were built from) and runs with cwd = the
# submodule: Circuit.from() resolves `target/<name>.json` against cwd.
#
# Toolchain: the circuits compile with nargo 1.0.0, the Noir version the circuits repo pins
# (NARGO, default the noirup install), and are proved with bb from the Aztec release that
# packages/aztec/.aztecrc pins, which must be FIRST in PATH: the Aztec protocol only accepts
# proofs from that bb's Honk transcript.
set -euo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
CIRCUITS=$HARNESS_DIR/circuits
AZTEC_VERSION=$(grep -v -e '^#' -e '^$' "$HARNESS_DIR/../.aztecrc" | head -n 1 | tr -d '[:space:]')
AZTEC=${AZTEC:-${AZTEC_HOME:-$HOME/.aztec}/versions/$AZTEC_VERSION}
BB_BIN=$AZTEC/node_modules/.bin
NOIR_VERSION=1.0.0
NARGO=${NARGO:-$HOME/.nargo/bin/nargo}

KINDS=("$@")
if [ ${#KINDS[@]} -eq 0 ]; then KINDS=(disclose age); fi

if [ ! -f "$CIRCUITS/package.json" ]; then
  echo "circuits submodule not initialized -- run: git submodule update --init ${CIRCUITS#"$(pwd)"/}" >&2
  exit 2
fi
if [ ! -d "$CIRCUITS/node_modules" ]; then
  echo "== npm install in the circuits submodule"
  (cd "$CIRCUITS" && npm install)
fi
if [ "$("$NARGO" --version | head -n 1)" != "nargo version = $NOIR_VERSION" ]; then
  echo "$NARGO is not nargo $NOIR_VERSION -- run: noirup -v $NOIR_VERSION, or set NARGO" >&2
  exit 2
fi

# Compile any circuit the generator proves that isn't built yet (target/ is gitignored
# upstream, so a fresh submodule starts empty).
for PKG in sig_check_dsc_tbs_700_rsa_pkcs_4096_sha512 \
  sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256 \
  data_check_integrity_sa_sha256_dg_sha256 \
  disclose_bytes compare_age bind outer_count_4 outer_count_5; do
  if [ ! -f "$CIRCUITS/target/$PKG.json" ]; then
    echo "== compiling $PKG with nargo $NOIR_VERSION"
    (cd "$CIRCUITS" && "$NARGO" compile --package "$PKG")
  fi
done

mkdir -p "$HARNESS_DIR/fixtures"

for KIND in "${KINDS[@]}"; do
  # The age lane carries a bind subproof on top of the disclosure one, hence count_5.
  COUNT=4
  if [ "$KIND" = age ]; then COUNT=5; fi
  OUT=$HARNESS_DIR/fixtures/outer_count_${COUNT}_$KIND.json
  echo "== generating $KIND fixture -> $OUT"
  # tsx is run directly, not through npx: npx would put the submodule's node_modules/.bin, and
  # the bb its @aztec/bb.js ships, ahead of $BB_BIN.
  (cd "$CIRCUITS" && PATH=$BB_BIN:$PATH FIXTURE_KIND=$KIND FIXTURE_OUT=$OUT node_modules/.bin/tsx "$HARNESS_DIR/generate-proof-fixtures.ts")
done
