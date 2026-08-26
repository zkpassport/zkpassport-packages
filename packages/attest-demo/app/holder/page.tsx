"use client"

import { useCallback, useEffect, useState } from "react"

import { PageShell } from "../../components/page-shell"
import { useDemo } from "../../components/demo-context"
import { TxStatus, useTx } from "../../components/tx-status"
import { listPoliciesWithDetails, revokeRequest, type PolicyView } from "../../lib/policies"
import { ensureWalletChain, writeAndWait } from "../../lib/wallet"

type Holding = { view: PolicyView; held: boolean }

function HolderView() {
  const { config, chain, ctx, wallet } = useDemo()
  const [holdings, setHoldings] = useState<Holding[]>([])
  const revoke = useTx()
  const [revokingId, setRevokingId] = useState<bigint | undefined>()

  const refresh = useCallback(async () => {
    if (!wallet) {
      setHoldings([])
      return
    }
    const views = await listPoliciesWithDetails(ctx)
    setHoldings(
      await Promise.all(
        views.map(async (view) => ({
          view,
          held: (await ctx.attest.balanceOf(wallet.account, view.policyId)) > 0n,
        })),
      ),
    )
  }, [ctx, wallet])

  useEffect(() => {
    refresh().catch(() => setHoldings([]))
  }, [refresh])

  const onRevoke = (policyId: bigint) => {
    setRevokingId(policyId)
    revoke
      .run(async () => {
        if (!wallet) throw new Error("Connect a wallet first.")
        await ensureWalletChain(wallet, chain)
        const receipt = await writeAndWait(
          wallet,
          ctx.publicClient,
          chain,
          revokeRequest(config.registry, wallet.account, policyId),
        )
        await refresh()
        return { hash: receipt.transactionHash, note: "credential revoked" }
      })
      .finally(() => setRevokingId(undefined))
  }

  if (!wallet) return <p className="text-slate-300">Connect your wallet to see your credentials.</p>

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {holdings.map(({ view, held }) => (
          <li
            key={view.policyId.toString()}
            className="flex items-center justify-between rounded border border-slate-700 p-3 text-sm"
          >
            <span className="break-all font-mono text-xs">{view.policyId.toString()}</span>
            <span className={held ? "text-emerald-400" : "text-slate-500"}>
              {held ? "held" : "none"}
            </span>
            {held && (
              <button
                className="rounded bg-red-800 px-2 py-1 text-xs disabled:opacity-50"
                type="button"
                disabled={revokingId === view.policyId}
                onClick={() => onRevoke(view.policyId)}
              >
                Revoke mine
              </button>
            )}
          </li>
        ))}
      </ul>
      {holdings.length === 0 && <p className="text-slate-400">No policies on this registry yet.</p>}
      <TxStatus state={revoke.state} explorerBaseUrl={chain.blockExplorers?.default.url} />
    </div>
  )
}

export default function Page() {
  return (
    <PageShell title="Holder — your credentials">
      <HolderView />
    </PageShell>
  )
}
