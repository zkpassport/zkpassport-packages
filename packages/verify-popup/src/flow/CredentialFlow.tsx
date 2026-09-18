import { useEffect, useMemo, useRef, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useDisconnect, useSwitchChain, type Config } from "wagmi"
import type { PopupCredentialConfig, PopupConfigureMessage } from "@zkpassport/sdk/popup"
import { ZKPassportQRCode } from "@zkpassport/ui/hosted"
import type { Chain } from "viem"

import { configuredRpcUrl, resolveCredentialsChain, rpcOverrideFromLocation } from "../chains"
import type { OutgoingEvent } from "../events"
import { buildWalletConfig } from "../wallet"
import { FlowCard, type ProgressSegment } from "./FlowCard"
import { useFlowPage } from "./use-flow-page"
import { Connect } from "./screens/Connect"
import { Done, type DoneOutcome } from "./screens/Done"
import { ErrorScreen } from "./screens/ErrorScreen"
import { Mint } from "./screens/Mint"
import { Resolving } from "./screens/Resolving"
import { ScanStep } from "./screens/Scan"
import {
  mintInProgress,
  useCredentialFlow,
  type DoneStep,
  type FlowStepKind,
  type MintPhase,
} from "./use-credential-flow"

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
  const appName = request.name ?? rpHost
  useFlowPage()

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
          send={send}
          chain={resolved.chain}
        />
      </QueryClientProvider>
    </WagmiProvider>
  )
}

type FlowBodyProps = Omit<CredentialFlowProps, "rpHost"> & {
  appName: string
  chain: Chain
}

function FlowBody({ request, credential, appName, send, chain }: FlowBodyProps) {
  const { step, scan, phase, payer, wallet, onRightChain, mint, startOver, checkTransaction } =
    useCredentialFlow({ request, credential, appName, chain, send })
  const switchChain = useSwitchChain()
  const disconnect = useDisconnect()

  const screen = (() => {
    switch (step.kind) {
      case "resolving":
        return <Resolving />
      case "verify":
        return (
          <ScanStep progress={scan}>
            <ZKPassportQRCode
              {...step.cardOptions}
              showIntroScreen
              theme="light"
              display={{ header: false, frame: false, steps: false, appLinks: false }}
            />
          </ScanStep>
        )
      case "mint":
        return !payer ? (
          <Connect />
        ) : (
          <Mint
            recipient={credential.recipient}
            payer={payer}
            wallet={wallet}
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
    : { kind: "already-verified", recipient }
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
