import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useDisconnect, useSwitchChain, type Config } from "wagmi"
import type { PopupCredentialConfig, PopupConfigureMessage } from "@zkpassport/sdk/popup"
import type { Chain } from "viem"

import { resolveWalletChain } from "./wagmi"
import type { OutgoingEvent } from "../app"
import { FlowCard, type ProgressSegment } from "../shared/flow-card"
import { useConfirmClose } from "../shared/use-confirm-close"
import { useContinueToAppClip } from "../shared/use-open-app"
import { Connect } from "./wallet"
import { Done, type DoneOutcome } from "../shared/done"
import { ErrorScreen } from "../shared/error"
import { Mint } from "./confirm"
import { Resolving } from "./resolving"
import type { ZKPassportQRCodeOptions } from "@zkpassport/ui/hosted"
import type { ScanProgress } from "../verify/waiting"
import { Intro } from "../verify/intro"
import { codeReplaced, codeShown, type Attempts } from "../verify/lane"
import { Scan } from "../verify/scan"
import { useRequestUrl } from "../verify/use-request-url"
import { Waiting } from "../verify/waiting"
import { describePhoneError } from "../verify/phone-errors"
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
  const appName = request.name || rpHost

  const resolved = useMemo(() => resolveWalletChain(credential.chain), [credential])

  useEffect(() => {
    if ("error" in resolved) {
      sendRef.current({ type: "error", message: resolved.error })
    }
  }, [resolved])

  // A chain the popup cannot reach is a configuration fault, so there is
  // nothing to retry
  if ("error" in resolved) {
    return (
      <FlowCard screenKey="error">
        <ErrorScreen
          title="This site isn’t set up yet"
          message={`${appName} can’t save verifications on this network yet.`}
          detail={resolved.error}
        />
      </FlowCard>
    )
  }

  return (
    <WalletProviders config={resolved.config}>
      <FlowBody
        request={request}
        credential={credential}
        appName={appName}
        rpHost={rpHost}
        send={send}
        chain={resolved.chain}
      />
    </WalletProviders>
  )
}

export function WalletProviders({ config, children }: { config: Config; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}

type FlowBodyProps = CredentialFlowProps & {
  appName: string
  chain: Chain
  /**
   * False on a page the user opened themselves, which can't close itself, so the done screen
   * offers no Return button.
   */
  closable?: boolean
  /** Offers another wallet on the consent screen, where the connected wallet is the recipient. */
  onChangeWallet?: () => void
}

export function FlowBody({
  request,
  credential,
  appName,
  rpHost,
  send,
  chain,
  closable,
  onChangeWallet,
}: FlowBodyProps) {
  const { step, scan, phase, payer, connector, onRightChain, mint, startOver, checkTransaction } =
    useCredentialFlow({ request, credential, appName, chain, send })
  const switchChain = useSwitchChain()
  const disconnect = useDisconnect()
  // Kept here because starting over rebuilds the verify step
  const [attempts, setAttempts] = useState<Attempts>({})

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
            logo={request.logo}
            rpHost={rpHost}
            purpose={request.purpose}
            options={step.cardOptions}
            progress={scan}
            attempts={attempts}
            onAttempts={setAttempts}
            onStartAgain={startOver}
            onChangeWallet={onChangeWallet}
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
            onStartOver={() => {
              setAttempts(codeReplaced(attempts, true))
              startOver()
            }}
            onCheckTransaction={checkTransaction}
          />
        )
      case "done":
        return (
          <Done
            outcome={doneOutcome(step, credential.recipient, chain)}
            appName={appName}
            closable={closable}
          />
        )
      case "error":
        return <ErrorScreen message={step.message} onRetry={startOver} />
    }
  })()

  return (
    <FlowCard
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
    : { kind: "already-verified", recipient, chain, heldUntil: step.heldUntil }
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
  logo,
  rpHost,
  purpose,
  options,
  progress,
  attempts,
  onAttempts,
  onStartAgain,
  onChangeWallet,
}: {
  appName: string
  logo?: string
  rpHost: string
  purpose?: string
  options: ZKPassportQRCodeOptions
  progress: ScanProgress | null
  attempts: Attempts
  onAttempts: (attempts: Attempts) => void
  onStartAgain: () => void
  onChangeWallet?: () => void
}) {
  const [consented, setConsented] = useState(false)
  const [failure, setFailure] = useState<{
    title?: string
    message: string
    detail?: string
    retryLabel?: string
    explained?: boolean
  } | null>(null)
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
        allowedVerificationMethods: options.allowedVerificationMethods,
        verifierMode: options.verifierMode,
      },
      query: options.query,
    },
    {
      onReceived: options.onRequestReceived,
      onProving: options.onGeneratingProof,
      onProof: options.onProofGenerated,
      onResult: (result) => {
        if (!result.verified) {
          setFailure({
            title: "Verification didn’t finish",
            message: "Your ID could not be verified. Try again.",
          })
        }
        options.onResult?.(result)
      },
      onReject: () => {
        setFailure({
          title: "Request declined",
          message: "You declined the request in ZKPassport. Start again if that was a mistake.",
          retryLabel: "Start again",
          explained: true,
        })
        options.onReject?.()
      },
      onError: (message) => {
        const known = describePhoneError(String(message), appName)
        setFailure(
          known
            ? { title: known.title, message: known.message }
            : {
                title: "Verification didn’t finish",
                message: "Something went wrong on your phone. Try again.",
                detail: String(message),
              },
        )
        options.onError?.(message)
      },
    },
  )

  useEffect(() => {
    if (req.url) onAttempts(codeShown(attempts))
  }, [req.url])

  const link = useRequestUrl(req.url, options, attempts.stalledAttempts)
  const appClip = useContinueToAppClip(link.url, () => setConsented(true))

  const tryAgain = () => {
    setFailure(null)
    onAttempts(codeReplaced(attempts, failure?.explained))
    req.retry()
  }

  const startAgain = () => {
    onAttempts(codeReplaced(attempts))
    onStartAgain()
  }

  if (failure) {
    const { explained: _explained, ...shown } = failure
    return <ErrorScreen {...shown} onRetry={tryAgain} />
  }
  if (progress) return <Waiting progress={progress} onStartAgain={startAgain} />
  if (!consented) {
    return (
      <Intro
        appName={appName}
        logo={logo}
        query={req.query}
        purpose={purpose}
        onContinue={appClip.onContinue}
        onChangeWallet={onChangeWallet}
      />
    )
  }
  return (
    <Scan
      state={req.state}
      url={link.url}
      qrSvg={link.qrSvg}
      onNewCode={tryAgain}
      appClipOpened={appClip.appClipOpened}
    />
  )
}
