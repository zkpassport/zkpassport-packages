import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useDisconnect, useSwitchChain, type Config } from "wagmi"
import type { PopupCredentialConfig, PopupConfigureMessage } from "@zkpassport/sdk/popup"
import { injectStyles, ZKPassportQRCode } from "@zkpassport/ui/hosted"
import type { Chain } from "viem"

import { configuredRpcUrl, resolveCredentialsChain, rpcOverrideFromLocation } from "../chains"
import { buildWalletConfig } from "../wallet"
import { FlowCard, type FlowStage } from "./FlowCard"
import { Done } from "./screens/Done"
import { ErrorScreen } from "./screens/ErrorScreen"
import { Mint } from "./screens/Mint"
import { Resolving } from "./screens/Resolving"
import { useCredentialFlow, type FlowStepKind, type OutgoingEvent } from "./use-credential-flow"
import "./flow.css"

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

  // The frame reuses the card's classes, so inject that stylesheet up front
  useLayoutEffect(injectStyles, [])

  // Only this flow paints the page behind the card; the other popup screens keep
  // the default background
  useLayoutEffect(() => {
    document.body.classList.add("zkp-flow-page")
    return () => document.body.classList.remove("zkp-flow-page")
  }, [])

  useEffect(() => {
    if ("error" in resolved) {
      sendRef.current({ type: "error", message: resolved.error })
    }
  }, [resolved])

  if ("error" in resolved) {
    return (
      <FlowCard name={appName} logo={request.logo} stage={null} stepKey="error">
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
  const { step, phase, payer, onRightChain, mint, startOver, checkTransaction } = useCredentialFlow(
    {
      request,
      credential,
      appName,
      chain,
      send,
    },
  )
  const switchChain = useSwitchChain()
  const disconnect = useDisconnect()

  const screen = (() => {
    switch (step.kind) {
      case "resolving":
        return <Resolving />
      case "verify":
        return (
          <ZKPassportQRCode
            {...step.cardOptions}
            showIntroScreen
            theme="light"
            display={{ header: false, frame: false }}
          />
        )
      case "mint":
        return (
          <Mint
            recipient={credential.recipient}
            payer={payer}
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
        return <Done step={step} recipient={credential.recipient} chain={chain} appName={appName} />
      case "error":
        return <ErrorScreen message={step.message} />
    }
  })()

  return (
    <FlowCard name={appName} logo={request.logo} stage={railStage(step.kind)} stepKey={step.kind}>
      {screen}
    </FlowCard>
  )
}

function railStage(kind: FlowStepKind): FlowStage {
  switch (kind) {
    case "resolving":
    case "verify":
      return "verify"
    case "mint":
      return "mint"
    case "done":
    case "error":
      return null
  }
}
