"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { PageShell } from "../../components/page-shell"
import { useDemo } from "../../components/demo-context"
import { TxStatus, useTx } from "../../components/tx-status"
import { introspectAuction, submitBidRequest } from "../../lib/auction"
import { openAttestPopup } from "../../lib/attest-popup"
import { ensureWalletChain, writeAndWait } from "../../lib/wallet"

type Gate =
  | { kind: "loading" }
  | { kind: "bad-auction"; message: string }
  | { kind: "checking" }
  | { kind: "not-eligible"; policyId: bigint }
  | { kind: "eligible"; policyId: bigint }

function BidderView() {
  const { config, chain, ctx, wallet } = useDemo()
  const [auction, setAuction] = useState<`0x${string}` | null>(null)
  const [gate, setGate] = useState<Gate>({ kind: "loading" })
  const [maxPrice, setMaxPrice] = useState("100")
  const [amount, setAmount] = useState("1")
  const bid = useTx()
  const popupRef = useRef<Window | null>(null)

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("auction")
    if (!param || !/^0x[0-9a-fA-F]{40}$/.test(param)) {
      setGate({
        kind: "bad-auction",
        message: "Pass ?auction=0x… (get the link from the launcher page).",
      })
      return
    }
    setAuction(param as `0x${string}`)
  }, [])

  const check = useCallback(async () => {
    if (!auction) return
    setGate({ kind: "checking" })
    const info = await introspectAuction(ctx.publicClient, config.registry, auction)
    if (!info) {
      setGate({
        kind: "bad-auction",
        message: "That address is not an auction gated by this registry.",
      })
      return
    }
    if (!wallet) {
      setGate({ kind: "not-eligible", policyId: info.policyId })
      return
    }
    const held = (await ctx.attest.balanceOf(wallet.account, info.policyId)) > 0n
    setGate({ kind: held ? "eligible" : "not-eligible", policyId: info.policyId })
  }, [auction, config.registry, ctx, wallet])

  useEffect(() => {
    check().catch(() => setGate({ kind: "bad-auction", message: "Could not read the auction." }))
  }, [check])

  useEffect(() => {
    if (gate.kind !== "not-eligible") return
    const interval = setInterval(() => {
      if (popupRef.current && !popupRef.current.closed) void check()
    }, 4000)
    return () => clearInterval(interval)
  }, [gate.kind, check])

  const openPopup = (policyId: bigint) => {
    if (!wallet) return
    popupRef.current = openAttestPopup(config, policyId, {
      // The popup mints to the account chosen there; re-check on any outcome
      onSuccess: () => void check(),
      onClose: () => void check(),
    })
  }

  const placeBid = (policyId: bigint) =>
    bid.run(async () => {
      if (!wallet) throw new Error("Connect a wallet first.")
      if (!auction) throw new Error("No auction.")
      void policyId
      await ensureWalletChain(wallet, chain)
      const receipt = await writeAndWait(
        wallet,
        ctx.publicClient,
        chain,
        submitBidRequest(auction, {
          maxPrice: BigInt(maxPrice),
          amount: BigInt(amount),
          owner: wallet.account,
        }),
      )
      return { hash: receipt.transactionHash, note: "bid accepted" }
    })

  return (
    <div className="space-y-6">
      {gate.kind === "loading" && <p>Loading…</p>}
      {gate.kind === "checking" && <p>Checking eligibility…</p>}
      {gate.kind === "bad-auction" && <p className="text-red-400">{gate.message}</p>}

      {gate.kind === "not-eligible" && (
        <section className="space-y-3">
          <p className="text-slate-300">
            This auction requires a ZKPassport credential (policy{" "}
            {gate.policyId.toString().slice(0, 18)}…).
            {wallet
              ? " Your wallet does not hold it yet."
              : " Connect your wallet to check eligibility."}
          </p>
          {wallet && (
            <button
              className="rounded bg-sky-600 px-4 py-2"
              type="button"
              onClick={() => openPopup(gate.policyId)}
            >
              Verify with ZKPassport
            </button>
          )}
          <button
            className="ml-2 rounded bg-slate-700 px-4 py-2"
            type="button"
            onClick={() => void check()}
          >
            Re-check eligibility
          </button>
        </section>
      )}

      {gate.kind === "eligible" && (
        <section className="space-y-3">
          <p className="text-emerald-400">Your wallet holds the credential — you can bid.</p>
          <label className="block text-sm">
            Max price
            <input
              className="ml-2 w-32 rounded bg-slate-800 px-2 py-1"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Amount
            <input
              className="ml-2 w-32 rounded bg-slate-800 px-2 py-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <button
            className="rounded bg-sky-600 px-4 py-2 disabled:opacity-50"
            type="button"
            disabled={bid.state.status === "pending"}
            onClick={() => placeBid(gate.policyId)}
          >
            Place bid
          </button>
          <TxStatus state={bid.state} explorerBaseUrl={chain.blockExplorers?.default.url} />
        </section>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <PageShell title="Bidder — verify and bid">
      <BidderView />
    </PageShell>
  )
}
