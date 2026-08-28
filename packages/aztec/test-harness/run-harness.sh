#!/usr/bin/env bash
# bb-level golden-fixture harness: prove & recursively verify a REAL ZKPassport
# `outer_count_4` proof THROUGH the zkpassport_core library, under the Aztec v5.2.0
# toolchain (nargo 1.0.0-beta.25 + bb 5.2.0-nightly).
#
# Usage: run-harness.sh <fixture.json> [--tamper-proof|--tamper-vk-hash|--tamper-commitment|
#                                        --tamper-public-input|--tamper-vk]
#
# Steps: fixture -> Prover.toml -> nargo execute -> bb write_vk -> bb prove -> bb verify.
# `bb prove` can "succeed" on bad inputs, so `bb verify`'s exit code is the ONLY pass signal:
# RESULT(...): VERIFIED is printed only after bb verify returns 0, and the script's own exit
# code mirrors the first failing step.
#
# Exit codes are captured DIRECTLY from each command (never through a pipe) -- piping the
# step and reading $? would report the exit code of `tail`, not of bb.
#
# Negative controls (each MUST exit non-zero):
#   --tamper-proof         -> fails at bb prove / bb verify (recursion constraint over `proof`)
#   --tamper-vk-hash       -> fails at nargo execute ("vk hash mismatch vs fixture" -- a
#                             wrapper-only convention pin, never reaches bb)
#   --tamper-commitment    -> fails at nargo execute ("param commitment mismatch" -- the
#                             library's own assert, not a recursion check)
#   --tamper-public-input  -> fails at bb prove / bb verify (recursion constraint over
#                             `public_inputs`; the load-bearing control that no PI can be
#                             substituted post-proof without breaking verification)
#   --tamper-vk            -> empirically fails at nargo execute (the wrapper's own vk_hash
#                             cross-stack pin catches a tampered vk before bb is ever reached --
#                             see fixture-to-prover-toml.ts's doc comment for detail)
#
# WARNING: do not run this script concurrently with itself (or with another mode) -- all
# invocations write to the shared recursive_verification/Prover.toml before executing. Run the
# matrix sequentially.
set -uo pipefail

HARNESS_DIR=$(cd "$(dirname "$0")" && pwd)
WRAP=$HARNESS_DIR/recursive_verification
AZTEC=/mnt/user-data/martin/.aztec/versions/5.2.0
BB=$AZTEC/node_modules/.bin/bb
NARGO=$AZTEC/bin/aztec-nargo
ARTIFACT=target/recursive_verification.json

if [ $# -lt 1 ]; then
  echo "usage: $0 <fixture.json> [--tamper-proof|--tamper-vk-hash|--tamper-commitment|--tamper-public-input|--tamper-vk]" >&2
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
[ $rc -eq 0 ] || fail "bb prove" $rc

echo "== bb verify"
$BB verify -t noir-recursive -p "$OUT/proof" -i "$OUT/public_inputs" -k "$OUT/vk" > "$OUT/verify.log" 2>&1
rc=$?
tail -3 "$OUT/verify.log"
[ $rc -eq 0 ] || fail "bb verify" $rc

echo "RESULT($LABEL): VERIFIED"
