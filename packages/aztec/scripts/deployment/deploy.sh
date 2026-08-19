#!/usr/bin/env bash
# Compile-and-deploy wrapper for src/deploy-testnet.ts / src/deploy-mainnet.ts.
#
# Guarantees the deployed artifact matches the source it was built from — including an
# optional shortened DelayedPublicMutable delay for preview deployments:
#
#   ./deploy.sh testnet                       # production build (INITIAL_DELAY = 86400)
#   PREVIEW_DELAY=7200 ./deploy.sh testnet    # preview build (2h delay)
#   PREVIEW_DELAY=7200 DRY_RUN=1 ./deploy.sh mainnet   # full pre-flight, no tx
#
# INITIAL_DELAY is a compile-time const generic on DelayedPublicMutable, so a preview
# delay means patching zkpassport_registry_contract/src/types.nr, recompiling, and
# deploying that class. The patch is deploy-time only: types.nr is restored on exit
# (the committed source always keeps the production 86400). A different delay is a
# different contract class, so preview and production registries get different
# addresses and coexist under the same deployer + salt.
#
# All other env vars (AZTEC_NODE_URL, ZKPASSPORT_DEPLOYER_SECRET, SALT, REGISTRY_*,
# and for mainnet L1_RPC_URL / L1_PRIVATE_KEY / FEE_JUICE_AMOUNT) pass through to the
# TS script — see src/deploy-<network>.ts.
set -euo pipefail

NETWORK="${1:-}"
[[ "$NETWORK" == "testnet" || "$NETWORK" == "mainnet" ]] || { echo "usage: $0 <testnet|mainnet>" >&2; exit 1; }

AZTEC="${AZTEC:-$HOME/.aztec/versions/5.2.0}"
E2E="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NR="$E2E/../zkpassport.nr"
TYPES="$NR/zkpassport_registry_contract/src/types.nr"

if [[ -n "${PREVIEW_DELAY:-}" ]]; then
  [[ "$PREVIEW_DELAY" =~ ^[0-9]+$ ]] || { echo "PREVIEW_DELAY must be an integer number of seconds, got '$PREVIEW_DELAY'" >&2; exit 1; }
  cp "$TYPES" "$TYPES.bak"
  trap 'mv "$TYPES.bak" "$TYPES"; echo "restored $TYPES (committed source keeps INITIAL_DELAY = 86400)"' EXIT
  sed -i "s/^pub global INITIAL_DELAY: u64 = [0-9]*;/pub global INITIAL_DELAY: u64 = $PREVIEW_DELAY;/" "$TYPES"
  grep -q "^pub global INITIAL_DELAY: u64 = $PREVIEW_DELAY;$" "$TYPES" || { echo "failed to patch INITIAL_DELAY in $TYPES" >&2; exit 1; }
  echo "preview build: INITIAL_DELAY patched to $PREVIEW_DELAY"
fi

# `aztec compile` (not bare aztec-nargo) — it transpiles the public bytecode for the
# AVM, without which loadContractArtifact rejects the artifact.
echo "compiling zkpassport_registry_contract with $AZTEC/bin/aztec compile..."
(cd "$NR" && "$AZTEC/bin/aztec" compile --package zkpassport_registry_contract)

(cd "$E2E" && npx tsx "deployment/deploy-$NETWORK.ts")

if [[ -n "${PREVIEW_DELAY:-}" ]]; then
  echo "NOTE: $NR/target now holds the PREVIEW build (INITIAL_DELAY = $PREVIEW_DELAY)." >&2
  echo "      Recompile before running anything else against target/ (e.g. run-e2e.ts)." >&2
fi
