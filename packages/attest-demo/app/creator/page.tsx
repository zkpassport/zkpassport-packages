"use client"

import { useCallback, useEffect, useState } from "react"

import { PageShell } from "../../components/page-shell"
import { useDemo } from "../../components/demo-context"
import { PolicyTable } from "../../components/policy-table"
import { TxStatus, useTx } from "../../components/tx-status"
import {
  createPolicyRequest,
  listPoliciesWithDetails,
  randomSalt,
  retireRequest,
  type PolicyView,
} from "../../lib/policies"
import { ensureWalletChain, writeAndWait } from "../../lib/wallet"

const DAY = 86400n

function CreatorView() {
  const { config, chain, ctx, wallet } = useDemo()
  const [policies, setPolicies] = useState<PolicyView[]>([])
  const [minAgeEnabled, setMinAgeEnabled] = useState(true)
  const [minAge, setMinAge] = useState(18)
  const [excludeCountries, setExcludeCountries] = useState(false)
  const [countries, setCountries] = useState("")
  const [sanctions, setSanctions] = useState(true)
  const [onePerDocument, setOnePerDocument] = useState(true)
  const [validityDays, setValidityDays] = useState(365)
  const [metadataURL, setMetadataURL] = useState("")
  const create = useTx()
  const retire = useTx()
  const [retiringId, setRetiringId] = useState<bigint | undefined>()

  const refresh = useCallback(async () => {
    setPolicies(await listPoliciesWithDetails(ctx))
  }, [ctx])

  useEffect(() => {
    refresh().catch(() => setPolicies([]))
  }, [refresh])

  const submit = () =>
    create.run(async () => {
      if (!wallet) throw new Error("Connect a wallet first.")
      await ensureWalletChain(wallet, chain)
      const receipt = await writeAndWait(
        wallet,
        ctx.publicClient,
        chain,
        createPolicyRequest(config.registry, {
          salt: randomSalt(),
          validityPeriodSeconds: BigInt(validityDays) * DAY,
          unique: onePerDocument,
          saltedNullifierOnly: true,
          minAge: minAgeEnabled ? minAge : 0,
          sanctionsCheck: sanctions,
          excludedCountries: excludeCountries
            ? countries
                .split(",")
                .map((c) => c.trim().toUpperCase())
                .filter(Boolean)
            : [],
          metadataURL,
        }),
      )
      await refresh()
      return { hash: receipt.transactionHash, note: "policy created" }
    })

  const onRetire = (policyId: bigint) => {
    setRetiringId(policyId)
    retire
      .run(async () => {
        if (!wallet) throw new Error("Connect a wallet first.")
        await ensureWalletChain(wallet, chain)
        const receipt = await writeAndWait(
          wallet,
          ctx.publicClient,
          chain,
          retireRequest(config.registry, policyId),
        )
        await refresh()
        return { hash: receipt.transactionHash, note: "policy retired" }
      })
      .finally(() => setRetiringId(undefined))
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Create a policy</h2>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={minAgeEnabled}
            onChange={(e) => setMinAgeEnabled(e.target.checked)}
          />{" "}
          Minimum age
          <input
            className="ml-2 w-20 rounded bg-slate-800 px-2 py-1 disabled:opacity-50"
            type="number"
            min={0}
            max={255}
            value={minAge}
            disabled={!minAgeEnabled}
            onChange={(e) => setMinAge(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={excludeCountries}
            onChange={(e) => setExcludeCountries(e.target.checked)}
          />{" "}
          Excluded nationalities (
          <a
            className="text-sky-400 underline"
            href="https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3"
            target="_blank"
            rel="noreferrer"
          >
            alpha-3
          </a>
          , comma-separated)
          <input
            className="ml-2 rounded bg-slate-800 px-2 py-1 disabled:opacity-50"
            value={countries}
            disabled={!excludeCountries}
            onChange={(e) => setCountries(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={sanctions}
            onChange={(e) => setSanctions(e.target.checked)}
          />{" "}
          Sanctions check
        </label>
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={onePerDocument}
            onChange={(e) => setOnePerDocument(e.target.checked)}
          />{" "}
          One credential per document
        </label>
        <label className="block text-sm">
          Validity (days)
          <input
            className="ml-2 w-24 rounded bg-slate-800 px-2 py-1"
            type="number"
            min={1}
            value={validityDays}
            onChange={(e) => setValidityDays(Number(e.target.value))}
          />
        </label>
        <label className="block text-sm">
          Metadata URL
          <input
            className="ml-2 w-72 rounded bg-slate-800 px-2 py-1"
            value={metadataURL}
            onChange={(e) => setMetadataURL(e.target.value)}
          />
        </label>
        <button
          className="rounded bg-sky-600 px-4 py-2 disabled:opacity-50"
          type="button"
          disabled={create.state.status === "pending"}
          onClick={submit}
        >
          Create policy
        </button>
        <TxStatus state={create.state} explorerBaseUrl={chain.blockExplorers?.default.url} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Policies on this registry</h2>
        <PolicyTable policies={policies} onRetire={onRetire} retiringId={retiringId} />
        <TxStatus state={retire.state} explorerBaseUrl={chain.blockExplorers?.default.url} />
      </section>
    </div>
  )
}

export default function Page() {
  return (
    <PageShell title="Creator — define a policy">
      <CreatorView />
    </PageShell>
  )
}
