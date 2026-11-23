#!/usr/bin/env bash
# The harness matrix: both counts verify, every negative control fails, sequentially.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
F=$HERE/../fixtures
for n in 5 7; do
  other=$F/subproofs_$([ $n = 5 ] && echo 7 || echo 5).json
  "$HERE/run.sh" $n
  for mode in --tamper-proof --wrong-vk-path --mismatched-nullifier --zeroed-nullifier; do
    "$HERE/run.sh" $n $mode
  done
  "$HERE/run.sh" $n --splice-csc "$other"
done
