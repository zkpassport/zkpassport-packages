"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AttestVerifyButton,
  type AttestIssueCall,
  type AttestVerifyResult,
} from "@zkpassport/ui/react"
import type { Chain } from "viem"

import { Disclosure } from "../components/disclosure"
import { MintStatus, type MintState } from "../components/mint-status"
import {
  checkCredential,
  createAttestContext,
  fetchPolicyView,
  submitIssue,
  type AttestContext,
  type PolicyView,
} from "../lib/attest"
import { resolveChain } from "../lib/chains"
import { disclosureClaims } from "../lib/disclosure"
import { parsePopupParams, PopupConfigError, type PopupConfig } from "../lib/params"
import {
  connectWallet,
  ensureWalletChain,
  getInjectedProvider,
  onAccountsChanged,
  type ConnectedWallet,
} from "../lib/wallet"

type Phase =
  | { kind: "loading" }
  | { kind: "config-error"; message: string }
  | { kind: "connect"; error?: string }
  | { kind: "already-verified" }
  | { kind: "prove"; wallet: ConnectedWallet; error?: string }
  | { kind: "mint"; wallet: ConnectedWallet; call: AttestIssueCall; state: MintState }
  | { kind: "done"; devProof: boolean }

type Session = {
  config: PopupConfig
  chain: Chain
  ctx: AttestContext
  view: PolicyView
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  const sessionRef = useRef<Session | null>(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      let config: PopupConfig
      try {
        config = parsePopupParams(new URLSearchParams(window.location.search), {
          allowRpcOverride: process.env.NODE_ENV !== "production",
        })
      } catch (reason) {
        setPhase({
          kind: "config-error",
          message:
            reason instanceof PopupConfigError ? reason.message : "Invalid verification link.",
        })
        return
      }
      const chain = resolveChain(config.chain, config.rpcOverride)
      const ctx = createAttestContext(config, chain)
      try {
        const view = await fetchPolicyView(ctx, config.policyId)
        if (cancelled) return
        if (view.policy.retiredAt !== 0n) {
          setPhase({
            kind: "config-error",
            message: "This policy has been retired and no longer issues credentials.",
          })
          return
        }
        sessionRef.current = { config, chain, ctx, view }
        setPhase({ kind: "connect" })
      } catch {
        if (!cancelled) {
          setPhase({
            kind: "config-error",
            message: "Could not load the policy. Check the link and try again.",
          })
        }
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return onAccountsChanged(() => {
      if (sessionRef.current) setPhase({ kind: "connect" })
    })
  }, [])

  const connect = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    try {
      const wallet = await connectWallet(session.chain, getInjectedProvider())
      const held = await checkCredential(session.ctx, wallet.account, session.config.policyId)
      setPhase(held ? { kind: "already-verified" } : { kind: "prove", wallet })
    } catch (reason) {
      setPhase({
        kind: "connect",
        error: reason instanceof Error ? reason.message : String(reason),
      })
    }
  }, [])

  const mint = useCallback(async (wallet: ConnectedWallet, call: AttestIssueCall) => {
    const session = sessionRef.current
    if (!session) return
    setPhase({ kind: "mint", wallet, call, state: { step: "pending" } })
    try {
      await ensureWalletChain(wallet, session.chain)
      await submitIssue(session.ctx, wallet, session.chain, call, (txHash) =>
        setPhase({ kind: "mint", wallet, call, state: { step: "pending", txHash } }),
      )
      const held = await checkCredential(session.ctx, wallet.account, session.config.policyId)
      if (!held) {
        throw new Error("The mint transaction succeeded but the credential was not found.")
      }
      setPhase({ kind: "done", devProof: false })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      const rejected = /rejected|denied/i.test(message)
      setPhase({
        kind: "mint",
        wallet,
        call,
        state: rejected ? { step: "rejected" } : { step: "failed", message },
      })
    }
  }, [])

  const onResult = useCallback(
    (wallet: ConnectedWallet) => (result: AttestVerifyResult) => {
      if (!result.verified) {
        setPhase({ kind: "prove", wallet, error: "Verification failed. Please try again." })
        return
      }
      if (result.issueCall) {
        void mint(wallet, result.issueCall)
      } else {
        setPhase({ kind: "done", devProof: true })
      }
    },
    [mint],
  )

  const session = sessionRef.current

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-8">
      {session && phase.kind !== "config-error" && (
        <Disclosure domain={session.view.domain} claims={disclosureClaims(session.view.policy)} />
      )}

      {phase.kind === "loading" && <p>Loading policy…</p>}

      {phase.kind === "config-error" && (
        <section className="max-w-md space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Something is wrong with this link</h1>
          <p className="text-red-400">{phase.message}</p>
        </section>
      )}

      {phase.kind === "connect" && (
        <section className="space-y-2 text-center">
          <button className="rounded bg-sky-600 px-6 py-3" type="button" onClick={connect}>
            Connect wallet
          </button>
          {phase.error && <p className="text-sm text-red-400">{phase.error}</p>}
        </section>
      )}

      {phase.kind === "already-verified" && session && (
        <ReturnNote domain={session.view.domain} title="You are already verified" />
      )}

      {phase.kind === "prove" && session && (
        <section className="space-y-2">
          <AttestVerifyButton
            client={session.ctx.publicClient}
            registryAddress={session.config.registry}
            policyId={session.config.policyId}
            wallet={phase.wallet.account}
            chain={session.config.chain}
            devMode={session.config.devMode}
            policy={session.view.policy}
            domain={session.view.domain}
            onResult={onResult(phase.wallet)}
          />
          {phase.error && <p className="text-sm text-red-400">{phase.error}</p>}
        </section>
      )}

      {phase.kind === "mint" && session && (
        <MintStatus
          state={phase.state}
          explorerBaseUrl={session.chain.blockExplorers?.default.url}
          onRetry={() => void mint(phase.wallet, phase.call)}
        />
      )}

      {phase.kind === "done" && session && (
        <ReturnNote
          domain={session.view.domain}
          title={phase.devProof ? "Dev proof verified — nothing minted" : "Credential minted"}
        />
      )}
    </main>
  )
}

function ReturnNote({ domain, title }: { domain: string; title: string }) {
  return (
    <section className="space-y-3 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-slate-300">You can return to {domain}.</p>
      <button
        className="rounded bg-slate-700 px-4 py-2"
        type="button"
        onClick={() => window.close()}
      >
        Close this window
      </button>
    </section>
  )
}
