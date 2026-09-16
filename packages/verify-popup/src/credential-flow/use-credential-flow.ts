import { useEffect, useMemo, useRef, useState } from "react"
import {
  useConnection,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi"
import type { Chain, Hex } from "viem"
import type {
  PopupCredentialConfig,
  PopupCredentialIssueCall,
  PopupConfigureMessage,
  PopupEventMessage,
} from "@zkpassport/sdk/popup"
import {
  createCredentialsContext,
  ZKPassportCredentialsAbi,
  type CredentialIssueCall,
} from "@zkpassport/onchain-credentials"
import {
  buildCredentialCardOptions,
  type CredentialVerifyResult,
  type ZKPassportQRCodeOptions,
} from "@zkpassport/ui/hosted"

import { describeMintError, type MintError } from "./mint-errors"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">
type SuccessMessage = Extract<OutgoingEvent, { type: "success" }>

type VerifiedProof = { success: SuccessMessage; issueCall: CredentialIssueCall }

// The relying party pairs the call with ZKPassportCredentialsAbi itself, so the
// ABI never travels over postMessage.
function toPopupIssueCall(call: CredentialIssueCall): PopupCredentialIssueCall {
  return { address: call.address, functionName: call.functionName, args: call.args }
}

export type MintPhase =
  | { name: "preflight" }
  | { name: "ready" }
  | { name: "signing" }
  | { name: "pending"; hash: Hex }
  | { name: "unconfirmed"; hash: Hex }
  | { name: "failed"; error: MintError }

export type DoneStep =
  | { kind: "done"; outcome: "minted"; hash: Hex }
  | { kind: "done"; outcome: "already-verified" }

export type FlowStepKind = FlowStep["kind"]

/** How far the phone has got, once it has picked the request up. */
export type ScanProgress = "scanned" | "proving"

type FlowStep =
  | { kind: "resolving" }
  | { kind: "verify"; cardOptions: ZKPassportQRCodeOptions }
  | { kind: "mint"; proof: VerifiedProof }
  | DoneStep
  | { kind: "error"; message: string }

type CredentialFlowParams = {
  request: PopupConfigureMessage["request"]
  credential: PopupCredentialConfig
  appName: string
  chain: Chain
  send: (message: OutgoingEvent) => void
}

// The card's raw result carries the live SDK instance; postMessage needs
// only the serializable fields.
function toSuccessMessage(raw: CredentialVerifyResult["raw"]): SuccessMessage {
  return { type: "success", proofs: raw.proofs ?? [], result: raw.result }
}

export function useCredentialFlow(params: CredentialFlowParams) {
  const { request, credential, appName, chain, send } = params
  const [step, setStep] = useState<FlowStep>({ kind: "resolving" })
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  // The connected wallet only pays the fee
  const { address: payer, chainId } = useConnection()
  const onRightChain = chainId === chain.id

  const { credentials: credentialsContract, publicClient } = useMemo(
    () => createCredentialsContext(chain),
    [chain],
  )
  const recipient = credential.recipient

  // Each resolve run takes a number; results from a superseded run are dropped
  const resolveAttempt = useRef(0)

  const emit = (message: OutgoingEvent) => sendRef.current(message)

  const resolve = () => {
    const attempt = ++resolveAttempt.current
    const stale = () => resolveAttempt.current !== attempt
    setStep({ kind: "resolving" })
    setScan(null)

    const run = async () => {
      const policyId = BigInt(credential.policyId)

      if (await credentialsContract.hasCredential(recipient, policyId)) {
        if (stale()) return
        setStep({ kind: "done", outcome: "already-verified" })
        emit({
          type: "success",
          proofs: [],
          result: {},
          credential: { status: "already-verified", recipient },
        })
        return
      }

      const cardOptions = await buildCredentialCardOptions({
        client: publicClient as never,
        registryAddress: credentialsContract.address,
        policyId,
        wallet: recipient,
        chain: credential.chain,
        name: appName,
        logo: request.logo,
        purpose: request.purpose,
        onRequestReceived: () => {
          setScan("scanned")
          emit({ type: "request-received" })
        },
        onGeneratingProof: () => {
          setScan("proving")
          emit({ type: "generating" })
        },
        onProofGenerated: (progress) =>
          emit({
            type: "proof-generated",
            index: progress.index,
            total: progress.total,
            name: progress.name,
          }),
        onReject: () => {
          setScan(null)
          emit({ type: "rejected" })
        },
        onError: (message) => {
          setScan(null)
          emit({ type: "error", message: String(message) })
        },
        onResult: (result) => {
          if (stale()) return
          // An unverified proof leaves the card in its own error state, with its retry
          if (!result.verified) return
          if (!result.issueCall) {
            const message = "The proof cannot be verified on-chain."
            setStep({ kind: "error", message })
            emit({ type: "error", message })
            return
          }
          setStep({
            kind: "mint",
            proof: {
              success: toSuccessMessage(result.raw),
              issueCall: result.issueCall,
            },
          })
        },
      })
      if (stale()) return
      setStep({ kind: "verify", cardOptions })
    }

    run().catch((reason: unknown) => {
      if (stale()) return
      const message = reason instanceof Error ? reason.message : String(reason)
      setStep({ kind: "error", message })
      emit({ type: "error", message })
    })
  }

  useEffect(() => {
    resolve()
    // StrictMode mounts twice in development; bumping the attempt drops the first run
    return () => {
      ++resolveAttempt.current
    }
  }, [])

  // Reverts are deterministic, so no retry, and a refetch on focus would flash "Checking…"
  const issueCall = step.kind === "mint" ? step.proof.issueCall : null
  const simulation = useSimulateContract({
    address: issueCall?.address,
    abi: ZKPassportCredentialsAbi,
    // Literal, not issueCall.functionName: it narrows the simulated request to
    // issue(), so write.mutate() below accepts it without a cast
    functionName: "issue",
    args: issueCall?.args,
    account: payer,
    chainId: chain.id,
    query: {
      enabled: issueCall !== null && payer !== undefined && onRightChain,
      retry: false,
      refetchOnWindowFocus: false,
    },
  })
  const write = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: chain.id })

  // The screen phrases failures in plain words; the raw error goes to the console
  const failure = receipt.error ?? write.error ?? simulation.error
  useEffect(() => {
    if (failure) console.error("[zkpassport] credential mint failed", failure)
  }, [failure])

  const mintedHash = receipt.data?.status === "success" ? write.data : undefined
  useEffect(() => {
    if (step.kind !== "mint" || !mintedHash) return
    setStep({ kind: "done", outcome: "minted", hash: mintedHash })
    emit({
      ...step.proof.success,
      credential: {
        status: "minted",
        recipient,
        txHash: mintedHash,
        issueCall: toPopupIssueCall(step.proof.issueCall),
      },
    })
  }, [mintedHash])

  const derivePhase = (): MintPhase => {
    if (receipt.data?.status === "reverted") {
      return { name: "failed", error: { kind: "failed", detail: "The transaction reverted." } }
    }
    if (write.isPending) return { name: "signing" }
    if (write.data && !mintedHash) {
      // The transaction is already out there, so a lookup failure must never offer to resend
      if (receipt.error) return { name: "unconfirmed", hash: write.data }
      return { name: "pending", hash: write.data }
    }
    if (write.error) return { name: "failed", error: describeMintError(write.error) }
    if (simulation.isFetching) return { name: "preflight" }
    if (simulation.error) return { name: "failed", error: describeMintError(simulation.error) }
    if (simulation.data) return { name: "ready" }
    return { name: "preflight" }
  }
  const phase = derivePhase()

  // Sends the simulated call; after a failed simulation it re-checks instead
  const mint = () => {
    if (simulation.data) write.mutate(simulation.data.request)
    else void simulation.refetch()
  }

  const startOver = () => {
    write.reset()
    resolve()
  }

  const checkTransaction = () => {
    void receipt.refetch()
  }

  return { step, scan, phase, payer, onRightChain, mint, startOver, checkTransaction }
}
