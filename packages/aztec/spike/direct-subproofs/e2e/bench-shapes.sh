#!/usr/bin/env bash
# Times where the glue runs: in the app (A), the registry (C) or its own contract (D).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TSX=$HERE/../../../test-harness/circuits/node_modules/.bin/tsx
cd "$HERE"
run() { timeout 3600 "$TSX" bench.ts "$@" 2>&1 | grep '^{"backend"'; }
for p in 1 2 3; do
  for n in 5 7; do for s in app registry verifier; do run native shape_${s}_$n 5; done; done
done
for n in 5 7; do for s in app registry verifier; do run wasm-1g shape_${s}_$n 2; done; done
echo DONE
