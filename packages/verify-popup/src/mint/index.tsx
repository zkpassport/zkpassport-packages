import { useEffect, useMemo, useRef, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useDisconnect, useSwitchChain, type Config } from "wagmi"
import type { PopupCredentialConfig, PopupConfigureMessage } from "@zkpassport/sdk/popup"
import type { Chain } from "viem"

import { configuredRpcUrl, resolveCredentialsChain, rpcOverrideFromLocation } from "./wagmi"
import type { OutgoingEvent } from "../app"
import { buildWalletConfig } from "./wagmi"
import { FlowCard, type ProgressSegment } from "../shared/flow-card"
import { useConfirmClose } from "../shared/use-confirm-close"
import { Connect } from "./wallet"
import { Done, type DoneOutcome } from "../shared/done"
import { ErrorScreen } from "../shared/error"
import { Mint } from "./confirm"
import { Resolving } from "./resolving"
import type { ZKPassportQRCodeOptions } from "@zkpassport/ui/hosted"
import type { ScanProgress } from "../verify/waiting"
import { Intro } from "../verify/intro"
import { Scan } from "../verify/scan"
import { Waiting } from "../verify/waiting"
import { useRequest } from "../request"
import {
  mintInProgress,
  useCredentialFlow,
  type DoneStep,
  type FlowStepKind,
  type MintPhase,
} from "./use-mint"

type CredentialFlowProps = {
  request: PopupConfigureMessage["request"]
  credential: PopupCredentialConfig
  // Hostname of the relying party page; the header falls back to it when no name is sent
  rpHost: string
  send: (message: OutgoingEvent) => void
}

// The chain arrives at runtime in the configure message, so the wagmi config
// cannot be a module constant.
export function CredentialFlow({ request, credential, rpHost, send }: CredentialFlowProps) {
  const sendRef = useRef(send)
  sendRef.current = send
  const [queryClient] = useState(() => new QueryClient())
  const appName = request.name || rpHost

  const resolved = useMemo((): { chain: Chain; config: Config } | { error: string } => {
    try {
      const chain = resolveCredentialsChain(
        credential.chain,
        rpcOverrideFromLocation(window.location) ?? configuredRpcUrl(credential.chain),
      )
      return { chain, config: buildWalletConfig(chain) }
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : String(reason) }
    }
  }, [credential])

  useEffect(() => {
    if ("error" in resolved) {
      sendRef.current({ type: "error", message: resolved.error })
    }
  }, [resolved])

  // A chain the popup cannot reach is a configuration fault, so there is
  // nothing to retry
  if ("error" in resolved) {
    return (
      <FlowCard name={appName} logo={request.logo} screenKey="error">
        <ErrorScreen message={resolved.error} />
      </FlowCard>
    )
  }

  return (
    <WagmiProvider config={resolved.config}>
      <QueryClientProvider client={queryClient}>
        <FlowBody
          request={request}
          credential={credential}
          appName={appName}
          rpHost={rpHost}
          send={send}
          chain={resolved.chain}
        />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

type FlowBodyProps = CredentialFlowProps & {
  appName: string
  chain: Chain
}

function FlowBody({ request, credential, appName, rpHost, send, chain }: FlowBodyProps) {
  const { step, scan, phase, payer, connector, onRightChain, mint, startOver, checkTransaction } =
    useCredentialFlow({ request, credential, appName, chain, send })
  const switchChain = useSwitchChain()
  const disconnect = useDisconnect()

  // Verifying costs the user real work, and a verified proof waiting to be
  // minted is lost with the window. Resolving and the endings are cheap.
  useConfirmClose(step.kind === "verify" || step.kind === "mint")

  const screen = (() => {
    switch (step.kind) {
      case "resolving":
        return <Resolving />
      case "verify":
        return (
          <VerifyStep
            appName={appName}
            rpHost={rpHost}
            purpose={request.purpose}
            options={step.cardOptions}
            progress={scan}
          />
        )
      case "mint":
        return !payer ? (
          <Connect />
        ) : (
          <Mint
            recipient={credential.recipient}
            payer={payer}
            connector={connector}
            chain={chain}
            onRightChain={onRightChain}
            phase={phase}
            onSwitchChain={() => switchChain.mutate({ chainId: chain.id })}
            onMint={mint}
            onChangeWallet={() => disconnect.mutate()}
            onStartOver={startOver}
            onCheckTransaction={checkTransaction}
          />
        )
      case "done":
        return <Done outcome={doneOutcome(step, credential.recipient, chain)} appName={appName} />
      case "error":
        return <ErrorScreen message={step.message} onRetry={startOver} />
    }
  })()

  return (
    <FlowCard
      name={appName}
      logo={request.logo}
      progress={progressSegments(step.kind, payer !== undefined, phase)}
      screenKey={step.kind}
    >
      {screen}
    </FlowCard>
  )
}

function doneOutcome(step: DoneStep, recipient: `0x${string}`, chain: Chain): DoneOutcome {
  return step.outcome === "minted"
    ? { kind: "minted", hash: step.hash, recipient, chain }
    : { kind: "already-verified", recipient, chain }
}

// Two steps: prove who you are, then mint the token
function progressSegments(
  kind: FlowStepKind,
  connected: boolean,
  phase: MintPhase,
): ProgressSegment[] | undefined {
  switch (kind) {
    case "resolving":
    case "verify":
      return ["active", "todo"]
    case "mint":
      // With no wallet the phase sits at its default, so check for one first
      // rather than show work that has not started
      return ["done", connected && mintInProgress(phase) ? "active" : "todo"]
    default:
      return undefined
  }
}

/**
 * The same consent and QR screens the verify journey uses, driven by the card
 * options the credential policy produced.
 */
function VerifyStep({
  appName,
  rpHost,
  purpose,
  options,
  progress,
}: {
  appName: string
  rpHost: string
  purpose?: string
  options: ZKPassportQRCodeOptions
  progress: ScanProgress | null
}) {
  const [consented, setConsented] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const req = useRequest(
    {
      // The policy's domain is read from the chain, not from the opener
      domain: options.domain ?? rpHost,
      request: {
        name: options.name,
        logo: options.logo,
        purpose: options.purpose,
        scope: options.scope,
        mode: options.mode,
        devMode: options.devMode,
        uniqueIdentifierType: options.uniqueIdentifierType,
        oprfKeyId: options.oprfKeyId,
        verifierMode: options.verifierMode,
      },
      query: options.query,
    },
    {
      onReceived: options.onRequestReceived,
      onProving: options.onGeneratingProof,
      onProof: options.onProofGenerated,
      onResult: (result) => {
        if (!result.verified) setFailure("Your ID could not be verified. Please try again.")
        options.onResult?.(result)
      },
      onReject: () => {
        setFailure("The request was declined on your phone.")
        options.onReject?.()
      },
      onError: (message) => {
        setFailure(String(message))
        options.onError?.(message)
      },
    },
  )

  const tryAgain = () => {
    setFailure(null)
    req.retry()
  }

  if (failure) return <ErrorScreen message={failure} onRetry={tryAgain} />
  if (progress) return <Waiting progress={progress} />
  if (!consented) {
    return (
      <Intro
        appName={appName}
        query={req.query}
        purpose={purpose}
        onContinue={() => setConsented(true)}
      />
    )
  }
  return <Scan state={req.state} url={req.url} qrSvg={req.qrSvg} />
}
