#!/usr/bin/env bash
# Bring up the attest demo on sepolia: deploy the registry (skipped when a
# deployment already exists), point .env.local at it, and run both apps.
# Extra arguments are forwarded to `forge script` on the deploy path, e.g.
#   scripts/demo-up.sh --private-key 0x…   or   scripts/demo-up.sh --account dev
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
contracts_dir="$repo_root/packages/attest-contracts"
demo_dir="$repo_root/packages/attest-demo"
deployment_file="$contracts_dir/deployments/11155111.json"

if [[ -f "$deployment_file" ]]; then
  echo "Registry already deployed, skipping deploy: $deployment_file"
else
  : "${ATTEST_ADMIN_ADDRESS:?ATTEST_ADMIN_ADDRESS must be set to deploy}"
  export ATTEST_ADMIN_ADDRESS
  export ROOT_VERIFIER_ADDRESS="${ROOT_VERIFIER_ADDRESS:-0x1D000001000EFD9a6371f4d90bB8920D5431c0D8}"
  # Default RPC is the public endpoint embedded in packages/zkpassport-sdk/src/index.ts
  SEPOLIA_RPC_URL="${SEPOLIA_RPC_URL:-https://eth-sepolia.g.alchemy.com/v2/in6UjcATST36yyKuk83yb1yukKs65u8G}"
  echo "Deploying ZKPassportAttest to sepolia (root verifier: $ROOT_VERIFIER_ADDRESS)"
  (cd "$contracts_dir" && forge script script/DeployAttest.s.sol --rpc-url "$SEPOLIA_RPC_URL" --broadcast "$@")
fi

registry_address="$(deployment_file="$deployment_file" bun -e \
  'console.log((await Bun.file(process.env.deployment_file).json()).address)')"
registry_deploy_block="$(deployment_file="$deployment_file" bun -e \
  'console.log((await Bun.file(process.env.deployment_file).json()).deployed_block ?? "")')"

env_local="$demo_dir/.env.local"
[[ -f "$env_local" ]] || cp "$demo_dir/.env.example" "$env_local"

set_env() {
  if grep -q "^$1=" "$env_local"; then
    sed -i.bak "s|^$1=.*|$1=$2|" "$env_local"
    rm -f "$env_local.bak"
  else
    echo "$1=$2" >>"$env_local"
  fi
  echo "attest-demo .env.local: $1=$2"
}

set_env NEXT_PUBLIC_REGISTRY_ADDRESS "$registry_address"
if [[ -n "$registry_deploy_block" ]]; then
  set_env NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK "$registry_deploy_block"
fi

(cd "$repo_root" && bun install)

bun --cwd "$repo_root/packages/attest-popup" dev &
popup_pid=$!
trap 'kill "$popup_pid" 2>/dev/null || true' EXIT
echo "attest-popup on http://localhost:3000 (pid $popup_pid), attest-demo on http://localhost:3001"
bun --cwd "$demo_dir" dev
