#!/usr/bin/env bash
# Runs the whole measurement matrix sequentially (nothing else should run meanwhile).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
TSX=$HERE/../../../test-harness/circuits/node_modules/.bin/tsx
BB=$HOME/.aztec/versions/6.0.0/node_modules/.bin/bb
FNS="bench_outer_5 bench_direct_5 bench_outer_7 bench_direct_7"
cd "$HERE"
run() { timeout 3600 "$TSX" bench.ts "$@" 2>&1 | grep '^{"backend"'; }

for p in 1 2 3; do for f in $FNS; do run native $f 5; done; done
for p in 1 2; do for f in $FNS; do run wasm $f 3; done; done
for f in $FNS; do run wasm-1g $f 2; done

# Cloud proxy: native UltraHonk proving of the outer circuit, as the cloud prover does
for n in 5 7; do
  D=$HERE/../fixtures/outer_count_${n}_prove
  "$BB" write_vk -t noir-recursive -b "$D/circuit.json" -o "$D" > /dev/null 2>&1
  for r in 1 2 3 4 5; do
    /usr/bin/time -l "$BB" prove -t noir-recursive -b "$D/circuit.json" -w "$D/witness.gz" -k "$D/vk" -o "$D" > "$D/prove-$r.log" 2>&1
    real=$(grep " real" "$D/prove-$r.log" | awk '{print $1}')
    rss=$(grep "maximum resident set size" "$D/prove-$r.log" | awk '{print $1}')
    echo "{\"backend\":\"bb-cli\",\"fn\":\"outer_count_${n}_ultrahonk\",\"run\":$r,\"wallMs\":$(echo "$real*1000" | bc | cut -d. -f1),\"peakRssMb\":$((rss/1048576))}" | tee -a results.jsonl
  done
done
echo DONE
