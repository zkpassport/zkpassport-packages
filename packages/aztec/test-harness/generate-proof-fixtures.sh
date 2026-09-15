#!/usr/bin/env bash
# Regenerate the proof fixtures consumed by test-recursive-verification.sh (and by the TXE tests).
#
# Usage: ./generate-proof-fixtures.sh [disclose|age] ...   (default: both)
#
# The generator imports the circuits repo's TS sources and deps from the `circuits/` submodule
# (pinned to the commit the committed fixtures were built from) and runs with cwd = the
# submodule: Circuit.from() resolves `target/<name>.json` against cwd.
#
# Toolchain: bb 5.0.0-nightly from the 5.0.1 aztec release must be FIRST in PATH -- that is
# the build ZKPassport's production circuits were compiled/proved with. The 5.2.0 bb is used
# only later, by test-recursive-verification.sh, to verify the wrapper.
set -euo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
CIRCUITS=$HARNESS_DIR/circuits
AZTEC_501=${AZTEC_501:-$HOME/.aztec/versions/5.0.1}
BB_501_BIN=$AZTEC_501/node_modules/.bin
NARGO_501=$AZTEC_501/bin/aztec-nargo

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

# Compile any circuit the generator proves that isn't built yet (target/ is gitignored
# upstream, so a fresh submodule starts empty).
for PKG in sig_check_dsc_tbs_700_rsa_pkcs_4096_sha512 \
  sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256 \
  data_check_integrity_sa_sha256_dg_sha256 \
  disclose_bytes compare_age bind outer_count_4 outer_count_5; do
  if [ ! -f "$CIRCUITS/target/$PKG.json" ]; then
    echo "== compiling $PKG with $($NARGO_501 --version | head -1)"
    (cd "$CIRCUITS" && $NARGO_501 compile --package "$PKG")
  fi
done

mkdir -p "$HARNESS_DIR/fixtures"

for KIND in "${KINDS[@]}"; do
  # The age lane carries a bind subproof on top of the disclosure one, hence count_5.
  COUNT=4
  if [ "$KIND" = age ]; then COUNT=5; fi
  OUT=$HARNESS_DIR/fixtures/outer_count_${COUNT}_$KIND.json
  echo "== generating $KIND fixture -> $OUT"
  (cd "$CIRCUITS" && PATH=$BB_501_BIN:$PATH FIXTURE_KIND=$KIND FIXTURE_OUT=$OUT npx tsx "$HARNESS_DIR/generate-proof-fixtures.ts")
done
