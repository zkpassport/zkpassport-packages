#!/usr/bin/env bash
# Regenerate the proof fixture consumed by test-recursive-verification.sh.
#
# Usage: ./generate-proof-fixtures.sh
#
# The generator imports the circuits repo's TS sources and deps from the `circuits/` submodule
# (pinned to the commit the committed fixtures were built from) and runs with cwd = the
# submodule: Circuit.from() resolves `target/<name>.json` against cwd.
#
# Toolchain: the circuits compile with nargo 1.0.0-beta.22 from the 5.0.1 aztec release, the
# Noir version the circuits repo pins, and are proved with bb 6.0.0 from the 6.0.0
# release, which must be FIRST in PATH: the Aztec protocol only accepts proofs from that bb's
# Honk transcript.
set -euo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
CIRCUITS=$HARNESS_DIR/circuits
AZTEC=${AZTEC_HOME:-$HOME/.aztec/versions/6.0.0}
BB_BIN=$AZTEC/node_modules/.bin
AZTEC_501=${AZTEC_501:-$HOME/.aztec/versions/5.0.1}
NARGO_501=$AZTEC_501/bin/aztec-nargo

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
  disclose_bytes outer_count_4; do
  if [ ! -f "$CIRCUITS/target/$PKG.json" ]; then
    echo "== compiling $PKG with $($NARGO_501 --version | head -1)"
    (cd "$CIRCUITS" && $NARGO_501 compile --package "$PKG")
  fi
done

mkdir -p "$HARNESS_DIR/fixtures"

OUT=$HARNESS_DIR/fixtures/outer_count_4_disclose.json
echo "== generating disclose fixture -> $OUT"
# tsx is run directly, not through npx: npx would put the submodule's node_modules/.bin, and
# the bb its @aztec/bb.js ships, ahead of $BB_BIN.
(cd "$CIRCUITS" && PATH=$BB_BIN:$PATH FIXTURE_OUT=$OUT node_modules/.bin/tsx "$HARNESS_DIR/generate-proof-fixtures.ts")
