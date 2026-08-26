"use client"

import { useCallback, useEffect, useState } from "react"

import { PageShell } from "../../components/page-shell"
import { useDemo } from "../../components/demo-context"
import { TxStatus, useTx } from "../../components/tx-status"
import { mockAuctionArtifact } from "../../lib/auction"
import { listPoliciesWithDetails, type PolicyView } from "../../lib/policies"
import { buildPopupUrl } from "../../lib/popup-url"
import { deployAndWait, ensureWalletChain } from "../../lib/wallet"

const STORAGE_KEY = "attest-demo.auctions"

type DeployedAuction = { address: `0x${string}`; policyId: string }

function loadDeployed(): DeployedAuction[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as DeployedAuction[]
  } catch {
    return []
  }
}

function LauncherView() {
  const { config, chain, ctx, wallet } = useDemo()
  const [policies, setPolicies] = useState<PolicyView[]>([])
  const [selected, setSelected] = useState<string>("")
  const [deployed, setDeployed] = useState<DeployedAuction[]>([])
  const deploy = useTx()

  useEffect(() => {
    listPoliciesWithDetails(ctx)
      .then((views) => {
        const live = views.filter((v) => v.policy.retiredAt === 0n)
        setPolicies(live)
        setSelected((current) => current || (live[0]?.policyId.toString() ?? ""))
      })
      .catch(() => setPolicies([]))
    setDeployed(loadDeployed())
  }, [ctx])

  const onDeploy = useCallback(() => {
    const view = policies.find((v) => v.policyId.toString() === selected)
    void deploy.run(async () => {
      if (!wallet) throw new Error("Connect a wallet first.")
      if (!view) throw new Error("Pick a policy first.")
      await ensureWalletChain(wallet, chain)
      const { address, receipt } = await deployAndWait(
        wallet,
        ctx.publicClient,
        chain,
        mockAuctionArtifact(),
        [view.hook],
      )
      const entry: DeployedAuction = { address, policyId: view.policyId.toString() }
      const next = [entry, ...loadDeployed()]
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // localStorage can be unavailable; the links below still work.
      }
      setDeployed(next)
      return { hash: receipt.transactionHash, note: `auction at ${address}` }
    })
  }, [chain, ctx, deploy, policies, selected, wallet])

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Deploy a gated auction</h2>
        <select
          className="rounded bg-slate-800 px-2 py-1"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {policies.map((v) => (
            <option key={v.policyId.toString()} value={v.policyId.toString()}>
              {v.policyId.toString().slice(0, 18)}… (
              {v.policy.minAge > 0 ? `age ≥ ${v.policy.minAge}` : "no age"})
            </option>
          ))}
        </select>
        <button
          className="ml-2 rounded bg-sky-600 px-4 py-2 disabled:opacity-50"
          type="button"
          disabled={deploy.state.status === "pending" || !selected}
          onClick={onDeploy}
        >
          Deploy MockAuction
        </button>
        <TxStatus state={deploy.state} explorerBaseUrl={chain.blockExplorers?.default.url} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Your auctions</h2>
        {deployed.length === 0 && (
          <p className="text-slate-400">Nothing deployed from this browser yet.</p>
        )}
        <ul className="space-y-4">
          {deployed.map((a) => (
            <li key={a.address} className="rounded border border-slate-700 p-3 text-sm">
              <p className="break-all font-mono text-xs">{a.address}</p>
              <p className="mt-2">
                Bidder page:{" "}
                <a
                  className="break-all text-sky-400 underline"
                  href={`/bidder?auction=${a.address}`}
                >
                  /bidder?auction={a.address}
                </a>
              </p>
              <p className="mt-1">
                Pre-launch verify link:{" "}
                <a
                  className="break-all text-sky-400 underline"
                  href={buildPopupUrl(config, BigInt(a.policyId))}
                  target="_blank"
                  rel="noreferrer"
                >
                  {buildPopupUrl(config, BigInt(a.policyId))}
                </a>
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default function Page() {
  return (
    <PageShell title="Launcher — deploy a gated auction">
      <LauncherView />
    </PageShell>
  )
}
