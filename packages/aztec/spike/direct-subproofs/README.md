# Direct subproof verification on Aztec (spike)

Verifies ZKPassport's fast-mode subproofs (CSC→DSC, DSC→ID data, integrity check, N disclosures)
in an Aztec private function instead of the outer proof the cloud prover builds. Circuits 0.23.0,
Aztec 6.0.0. Not production code.

- `noir/subproofs`: `verify_zkpassport_subproofs<N>`, the `outer_count_{N+3}` glue generic over the
  number of disclosures, plus the checks `zkpassport::verify` makes on outer public inputs.
- `noir/subproofs_aztec`: loads those inputs from the calling contract's capsules.
- `noir/subproofs_test_contract`: `SubproofsVerifierTest`, paired outer/direct functions read from
  capsules. `verify_*` also call the registry, `bench_*` verify only, and `shape_*` run the glue in
  the app (A), the registry (C) or its own contract (D).
- `noir/registry_standin_contract`, `noir/subproofs_verifier_contract`: a registry stand-in with the
  same trivial checks for every shape (and the glue, for C), and the separate verifier for D.
- `harness`: native `bb prove`/`bb verify` of the glue over real subproofs, with negative controls.
- `e2e`: deploys the test contract on a local network and proves each bench function's tx with the
  PXE (native, WASM, WASM capped at 1 GiB).
- `fixtures`: 0.23.0 subproofs and outer proofs for 5 and 7 subproofs, from
  `test-harness/generate-proof-fixtures.ts` with `SUBPROOFS_OUT` (kinds `age` and `age7`).

## Rerun

With the 6.0.0 toolchain on `PATH` and the `test-harness/circuits` submodule at the 0.23.0 commit:

```bash
(cd noir && aztec compile)
(cd harness/count_5 && aztec-nargo compile) && (cd harness/count_7 && aztec-nargo compile)
harness/matrix.sh                      # positive runs and every negative control
aztec start --local-network            # in another shell
cd e2e && ln -sfn ~/.aztec/versions/6.0.0/node_modules node_modules
../../../test-harness/circuits/node_modules/.bin/tsx deploy.ts
./bench-all.sh                         # outer vs direct, appends to results.jsonl
./bench-shapes.sh                      # glue in the app, the registry or its own contract
../../../test-harness/circuits/node_modules/.bin/tsx gas.ts bench_outer_5 bench_direct_5  # gas.jsonl
```

`tsx` is needed rather than plain `node`: the 6.0.0 packages import JSON without import attributes.
