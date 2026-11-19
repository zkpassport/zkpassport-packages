#!/usr/bin/env bash
# bb-level fixture harness: prove & recursively verify a ZKPassport `outer_count_4` proof through
# the zkpassport library, under the Aztec toolchain that packages/aztec/.aztecrc pins (its
# aztec-nargo and bb).
#
# Usage: test-recursive-verification.sh <fixture.json> [--tamper-proof|--tamper-public-input]
#
# Steps: fixture -> Prover.toml -> nargo execute -> bb write_vk -> bb prove -> bb verify.
#
# Negative controls, which exit 0 only when bb rejects the tampered proof (at bb prove or
# bb verify, exiting 1 with one of bb's rejection messages), and non-zero when it verifies, when
# anything fails before bb proves (such as a fixture of the wrong shape), or when bb dies another
# way (such as an out-of-memory kill):
#   --tamper-proof         -> rejected by the recursion constraint over `proof`
#   --tamper-public-input  -> rejected by the recursion constraint over `public_inputs`; the
#                             control that no PI can be substituted post-proof without breaking
#                             verification
#
# WARNING: do not run this script concurrently with itself (or with another mode) -- all
# invocations write to the shared recursive_verification/Prover.toml before executing. Run the
# matrix sequentially.
set -uo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
WRAP=$HARNESS_DIR/recursive_verification
AZTEC_VERSION=$(grep -v -e '^#' -e '^$' "$HARNESS_DIR/../.aztecrc" | head -n 1 | tr -d '[:space:]')
AZTEC=${AZTEC:-${AZTEC_HOME:-$HOME/.aztec}/versions/$AZTEC_VERSION}
BB=$AZTEC/node_modules/.bin/bb
NARGO=$AZTEC/bin/aztec-nargo
ARTIFACT=target/recursive_verification.json

if [ $# -lt 1 ]; then
  echo "usage: $0 <fixture.json> [--tamper-proof|--tamper-public-input]" >&2
  exit 2
fi
FIXTURE=$1
TAMPER=${2:-}
LABEL=$(basename "$FIXTURE" .json)${TAMPER:+-${TAMPER#--}}
OUT=$WRAP/out-$LABEL
rm -rf "$OUT" && mkdir -p "$OUT"

fail() { # fail <step> <rc>
  echo "RESULT($LABEL): FAILED at $1 (exit $2)"
  exit "$2"
}

# What bb 6.0.0 prints when it rejects a proof: a failed assertion while proving over a tampered
# proof, an unsatisfied circuit, or a failed verification
BB_REJECTION='Assertion failed|Builder failure|verification failed|Failed to verify'

# A tampered proof must fail where bb checks the recursion constraint, and nowhere earlier
rejected() { # rejected <step> <rc> <log>
  if [ -n "$TAMPER" ] && [ "$2" -eq 1 ] && grep -qE "$BB_REJECTION" "$3"; then
    echo "RESULT($LABEL): REJECTED at $1 (exit $2), as expected"
    exit 0
  fi
  fail "$1" "$2"
}

bun "$HARNESS_DIR/fixture-to-prover-toml.ts" "$FIXTURE" "$WRAP/Prover.toml" $TAMPER
rc=$?
[ $rc -eq 0 ] || fail "prover-toml" $rc

cd "$WRAP" || exit 1

echo "== nargo execute ($($NARGO --version | head -1))"
$NARGO execute witness > "$OUT/execute.log" 2>&1
rc=$?
tail -3 "$OUT/execute.log"
[ $rc -eq 0 ] || fail "nargo execute" $rc

echo "== bb write_vk ($($BB --version | tail -1))"
$BB write_vk -t noir-recursive -b "$ARTIFACT" -o "$OUT" > "$OUT/write_vk.log" 2>&1
rc=$?
tail -2 "$OUT/write_vk.log"
[ $rc -eq 0 ] || fail "bb write_vk" $rc

echo "== bb prove"
$BB prove -t noir-recursive -b "$ARTIFACT" -w target/witness.gz -k "$OUT/vk" -o "$OUT" > "$OUT/prove.log" 2>&1
rc=$?
tail -3 "$OUT/prove.log"
[ $rc -eq 0 ] || rejected "bb prove" $rc "$OUT/prove.log"

echo "== bb verify"
$BB verify -t noir-recursive -p "$OUT/proof" -i "$OUT/public_inputs" -k "$OUT/vk" > "$OUT/verify.log" 2>&1
rc=$?
tail -3 "$OUT/verify.log"
[ $rc -eq 0 ] || rejected "bb verify" $rc "$OUT/verify.log"

if [ -n "$TAMPER" ]; then
  echo "RESULT($LABEL): VERIFIED a tampered proof"
  exit 1
fi
echo "RESULT($LABEL): VERIFIED"
