import { useEffect, useRef, useState } from "react"
import type {
  PopupAttestConfig,
  PopupAttestIssueCall,
  PopupConfigureMessage,
  PopupEventMessage,
} from "@zkpassport/sdk/popup"
import {
  buildAttestCardOptions,
  ZKPassportQRCode,
  type AttestVerifyResult,
  type ZKPassportQRCodeOptions,
} from "@zkpassport/ui/hosted"

import { createAttestContext, canMintHere, hasCredential, mintCredential } from "./attest"
import { resolveAttestChain } from "./chains"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">

type AttestFlowProps = {
  request: PopupConfigureMessage["request"]
  attest: PopupAttestConfig
  send: (message: OutgoingEvent) => void
  scheduleClose: (delayMs: number) => void
}

type FlowState =
  | { step: "resolving" }
  | { step: "card"; cardOptions: ZKPassportQRCodeOptions }
  | { step: "card"; cardOptions: ZKPassportQRCodeOptions; minting: true }
  | { step: "already-verified" }
  | { step: "minted"; txHash: `0x${string}` }
  | { step: "unminted" }
  | { step: "error"; message: string }

// The card's raw result carries the live SDK instance; postMessage needs
// only the serializable fields.
function toSuccessMessage(
  raw: AttestVerifyResult["raw"],
): Extract<OutgoingEvent, { type: "success" }> {
  return {
    type: "success",
    proofs: raw.proofs ?? [],
    result: raw.result,
  }
}

export function AttestFlow({ request, attest, send, scheduleClose }: AttestFlowProps) {
  const [state, setState] = useState<FlowState>({ step: "resolving" })
  const sendRef = useRef(send)
  sendRef.current = send

  useEffect(() => {
    let cancelled = false
    const emit = (message: OutgoingEvent) => sendRef.current(message)
    const fail = (reason: unknown) => {
      if (cancelled) return
      const message = reason instanceof Error ? reason.message : String(reason)
      setState({ step: "error", message })
      emit({ type: "error", message })
    }

    const start = async () => {
      const chain = resolveAttestChain(attest.chain, attest.rpcUrl)
      const ctx = createAttestContext(attest, chain)
      const policyId = BigInt(attest.policyId)

      if (await hasCredential(ctx, attest.walletAddress, policyId)) {
        if (cancelled) return
        setState({ step: "already-verified" })
        emit({
          type: "success",
          proofs: [],
          result: {},
          attest: { status: "already-verified" },
        })
        scheduleClose(2000)
        return
      }

      const finish = async (result: AttestVerifyResult) => {
        if (cancelled) return
        const base = toSuccessMessage(result.raw)
        if (!result.verified || !result.issueCall) {
          emit(base)
          return
        }
        const issueCall = result.issueCall as PopupAttestIssueCall
        if (!canMintHere()) {
          setState({ step: "unminted" })
          emit({
            ...base,
            attest: { status: "unminted", reason: "No wallet available in the popup", issueCall },
          })
          return
        }
        setState((current) => (current.step === "card" ? { ...current, minting: true } : current))
        try {
          const txHash = await mintCredential(ctx, issueCall)
          if (cancelled) return
          setState({ step: "minted", txHash })
          emit({ ...base, attest: { status: "minted", txHash, issueCall } })
          scheduleClose(2500)
        } catch (reason) {
          if (cancelled) return
          setState({ step: "unminted" })
          emit({
            ...base,
            attest: {
              status: "unminted",
              reason: reason instanceof Error ? reason.message : String(reason),
              issueCall,
            },
          })
        }
      }

      const cardOptions = await buildAttestCardOptions({
        client: ctx.publicClient as never,
        registryAddress: attest.registry,
        policyId,
        wallet: attest.walletAddress,
        chain: attest.chain,
        devMode: request.devMode,
        name: request.name,
        logo: request.logo,
        purpose: request.purpose,
        onRequestReceived: () => emit({ type: "request-received" }),
        onGeneratingProof: () => emit({ type: "generating" }),
        onProofGenerated: (proof) =>
          emit({
            type: "proof-generated",
            index: proof.index,
            total: proof.total,
            name: proof.name,
          }),
        onReject: () => {
          emit({ type: "rejected" })
          scheduleClose(1500)
        },
        onError: (message) => emit({ type: "error", message: String(message) }),
        onResult: (result) => void finish(result),
      })
      if (cancelled) return
      setState({ step: "card", cardOptions })
    }

    start().catch(fail)
    return () => {
      cancelled = true
    }
  }, [request, attest, scheduleClose])

  switch (state.step) {
    case "resolving":
      return <p style={styles.notice}>Loading the verification policy…</p>
    case "already-verified":
      return <p style={styles.notice}>This wallet already holds this credential. You're all set.</p>
    case "minted":
      return (
        <p style={styles.notice}>
          Credential minted. You can return to the app.
          <span style={styles.detail}>tx {state.txHash.slice(0, 10)}…</span>
        </p>
      )
    case "unminted":
      return (
        <p style={styles.notice}>
          Verification succeeded, but the credential wasn't minted here. Return to the app to finish
          minting from your connected wallet.
        </p>
      )
    case "error":
      return <p style={styles.notice}>{state.message}</p>
    case "card":
      return (
        <>
          <ZKPassportQRCode {...state.cardOptions} showIntroScreen />
          {"minting" in state ? (
            <p style={styles.notice} role="status">
              Confirm the mint transaction in your wallet — any account can pay for it; the
              credential goes to your verified wallet.
            </p>
          ) : null}
        </>
      )
  }
}

const styles: Record<string, React.CSSProperties> = {
  notice: {
    maxWidth: 340,
    marginTop: 16,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 1.5,
    color: "#6b7280",
  },
  detail: {
    display: "block",
    marginTop: 6,
    fontSize: 12,
    color: "#9ca3af",
  },
}
