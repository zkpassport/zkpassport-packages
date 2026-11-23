#!/usr/bin/env bash
# Prove and verify verify_zkpassport_subproofs over real subproofs with bb, so the recursion is
# actually checked (TXE and nargo execute skip it).
#
# Usage: run.sh <5|7> [negative-control] [other-subproofs.json]
#   See subproofs-to-prover-toml.ts for the controls. Each control must exit non-zero.
set -uo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
COUNT=$1
MODE=${2:-}
OTHER=${3:-}
AZTEC_VERSION=$(grep -v -e '^#' -e '^$' "$HERE/../../../.aztecrc" | head -n 1 | tr -d '[:space:]')
AZTEC=${AZTEC:-${AZTEC_HOME:-$HOME/.aztec}/versions/$AZTEC_VERSION}
BB=$AZTEC/node_modules/.bin/bb
NARGO=$AZTEC/bin/aztec-nargo
CRATE=$HERE/count_$COUNT
LABEL=count_$COUNT${MODE:+-${MODE#--}}
OUT=$CRATE/out-$LABEL
rm -rf "$OUT" && mkdir -p "$OUT"

fail() {
  echo "RESULT($LABEL): FAILED at $1 (exit $2)"
  exit "$2"
}

bun "$HERE/subproofs-to-prover-toml.ts" "$HERE/../fixtures/subproofs_$COUNT.json" "$OUT/Prover.toml" $MODE $OTHER || fail prover-toml $?
cd "$CRATE" || exit 1

$NARGO execute -p "$OUT/Prover.toml" witness > "$OUT/execute.log" 2>&1
rc=$?
grep -m1 -E "error|Failed|failed" "$OUT/execute.log"
[ $rc -eq 0 ] || fail "nargo execute" $rc

ARTIFACT=target/direct_subproofs_count_$COUNT.json
$BB gates -b "$ARTIFACT" > "$OUT/gates.json" 2>/dev/null
$BB write_vk -t noir-recursive -b "$ARTIFACT" -o "$OUT" > "$OUT/write_vk.log" 2>&1 || fail "bb write_vk" $?
/usr/bin/time -l $BB prove -t noir-recursive -b "$ARTIFACT" -w target/witness.gz -k "$OUT/vk" -o "$OUT" > "$OUT/prove.log" 2>&1
rc=$?
tail -2 "$OUT/prove.log" | head -1
[ $rc -eq 0 ] || fail "bb prove" $rc
$BB verify -t noir-recursive -p "$OUT/proof" -i "$OUT/public_inputs" -k "$OUT/vk" > "$OUT/verify.log" 2>&1
rc=$?
tail -1 "$OUT/verify.log"
[ $rc -eq 0 ] || fail "bb verify" $rc

echo "RESULT($LABEL): VERIFIED"
