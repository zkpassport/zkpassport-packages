"use client"

import { useEffect, useState } from "react"

import { PageShell } from "../../components/page-shell"
import { useDemo } from "../../components/demo-context"
import { TxStatus, useTx } from "../../components/tx-status"
import {
  guardianOf,
  listPoliciesWithDetails,
  revokeRequest,
  type PolicyView,
} from "../../lib/policies"
import { ensureWalletChain, writeAndWait } from "../../lib/wallet"

function GuardianView() {
  const { config, chain, ctx, wallet } = useDemo()
  const [guardian, setGuardian] = useState<`0x${string}` | null>(null)
  const [policies, setPolicies] = useState<PolicyView[]>([])
  const [target, setTarget] = useState("")
  const [selected, setSelected] = useState("")
  const revoke = useTx()

  useEffect(() => {
    guardianOf(ctx)
      .then(setGuardian)
      .catch(() => setGuardian(null))
    listPoliciesWithDetails(ctx)
      .then((views) => {
        setPolicies(views)
        setSelected((current) => current || (views[0]?.policyId.toString() ?? ""))
      })
      .catch(() => setPolicies([]))
  }, [ctx])

  const isGuardian = wallet && guardian && wallet.account.toLowerCase() === guardian.toLowerCase()

  const onRevoke = () =>
    revoke.run(async () => {
      if (!wallet) throw new Error("Connect a wallet first.")
      if (!/^0x[0-9a-fA-F]{40}$/.test(target)) throw new Error("Enter the wallet to revoke (0x…).")
      if (!selected) throw new Error("Pick a policy.")
      await ensureWalletChain(wallet, chain)
      const receipt = await writeAndWait(
        wallet,
        ctx.publicClient,
        chain,
        revokeRequest(config.registry, target as `0x${string}`, BigInt(selected)),
      )
      return { hash: receipt.transactionHash, note: "credential revoked" }
    })

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Registry guardian:{" "}
        <span className="break-all font-mono text-xs">{guardian ?? "unknown"}</span>
      </p>
      {wallet && !isGuardian && (
        <p className="text-amber-400">
          The connected wallet is not the guardian — revocations below will revert.
        </p>
      )}
      <label className="block text-sm">
        Wallet to revoke
        <input
          className="ml-2 w-96 max-w-full rounded bg-slate-800 px-2 py-1 font-mono text-xs"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="0x…"
        />
      </label>
      <label className="block text-sm">
        Policy
        <select
          className="ml-2 rounded bg-slate-800 px-2 py-1"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {policies.map((v) => (
            <option key={v.policyId.toString()} value={v.policyId.toString()}>
              {v.policyId.toString().slice(0, 18)}…
            </option>
          ))}
        </select>
      </label>
      <button
        className="rounded bg-red-800 px-4 py-2 disabled:opacity-50"
        type="button"
        disabled={revoke.state.status === "pending"}
        onClick={onRevoke}
      >
        Revoke credential
      </button>
      <TxStatus state={revoke.state} explorerBaseUrl={chain.blockExplorers?.default.url} />
    </div>
  )
}

export default function Page() {
  return (
    <PageShell title="Guardian — revoke any credential">
      <GuardianView />
    </PageShell>
  )
}
