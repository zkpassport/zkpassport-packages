import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { ConnectButton, RainbowKitProvider } from "@rainbow-me/rainbowkit"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { WagmiProvider, useAccount, useWalletClient } from "wagmi"
import type {
  PopupAttestConfig,
  PopupAttestIssueCall,
  PopupConfigureMessage,
  PopupEventMessage,
} from "@zkpassport/sdk/popup"
import {
  buildAttestCardOptions,
  ICON_ZKP_MARK,
  injectStyles,
  ZKPassportQRCode,
  type AttestVerifyResult,
  type ZKPassportQRCodeOptions,
} from "@zkpassport/ui/hosted"
import "@rainbow-me/rainbowkit/styles.css"
import type { Chain } from "viem"

import { createAttestContext, hasCredential, mintCredential } from "./attest"
import { resolveAttestChain } from "./chains"
import { buildWalletSetup, type WalletSetup } from "./wallet"

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
type OutgoingEvent = DistributiveOmit<PopupEventMessage, "zkpassport">
type SuccessMessage = Extract<OutgoingEvent, { type: "success" }>

type AttestFlowProps = {
  request: PopupConfigureMessage["request"]
  attest: PopupAttestConfig
  send: (message: OutgoingEvent) => void
}

// The card's raw result carries the live SDK instance; postMessage needs
// only the serializable fields.
function toSuccessMessage(raw: AttestVerifyResult["raw"]): SuccessMessage {
  return {
    type: "success",
    proofs: raw.proofs ?? [],
    result: raw.result,
  }
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

// Mounts the wagmi/RainbowKit providers once the chain is known; the chain
// (and its RPC override) arrives at runtime in the configure message, so the
// wagmi config cannot be a module-level constant.
export function AttestFlow({ request, attest, send }: AttestFlowProps) {
  const sendRef = useRef(send)
  sendRef.current = send
  const [queryClient] = useState(() => new QueryClient())

  const resolved = useMemo((): { chain: Chain; wallet: WalletSetup } | { error: string } => {
    try {
      const chain = resolveAttestChain(attest.chain, attest.rpcUrl)
      return { chain, wallet: buildWalletSetup(chain) }
    } catch (reason) {
      return { error: reason instanceof Error ? reason.message : String(reason) }
    }
  }, [attest])

  // The steps around the QR card reuse its `zkp-card` box; the stylesheet
  // normally arrives with the card component, so inject it up front.
  useLayoutEffect(injectStyles, [])

  useEffect(() => {
    if ("error" in resolved) {
      sendRef.current({ type: "error", message: resolved.error })
    }
  }, [resolved])

  if ("error" in resolved) {
    return (
      <CardFrame logo={request.logo}>
        <p className="zkp-intro-question-text" style={styles.centeredText}>
          {resolved.error}
        </p>
      </CardFrame>
    )
  }

  return (
    <WagmiProvider config={resolved.wallet.config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <AttestFlowBody
            request={request}
            attest={attest}
            send={send}
            chain={resolved.chain}
            injectedOnly={resolved.wallet.injectedOnly}
          />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

type Account = `0x${string}`

type BodyState =
  | { step: "select" }
  | { step: "checking"; account: Account }
  | { step: "already-verified"; account: Account }
  | { step: "verify"; account: Account }
  | { step: "minting"; account: Account }
  | { step: "minted"; account: Account; txHash: `0x${string}` }
  | {
      step: "unminted"
      account: Account
      reason: string
      base: SuccessMessage
      issueCall: PopupAttestIssueCall
    }
  | { step: "error"; message: string }

function AttestFlowBody({
  request,
  attest,
  send,
  chain,
  injectedOnly,
}: AttestFlowProps & { chain: Chain; injectedOnly: boolean }) {
  const [state, setState] = useState<BodyState>({ step: "select" })
  const [cardOptions, setCardOptions] = useState<ZKPassportQRCodeOptions | null>(null)
  const sendRef = useRef(send)
  sendRef.current = send

  const { address: activeAddress, addresses, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const walletRef = useRef(walletClient)
  walletRef.current = walletClient

  const [chosen, setChosen] = useState<Account | null>(null)
  // Numbers each selection so a slow credential check or card build from a
  // superseded account can't overwrite the current one.
  const attemptRef = useRef(0)

  const ctx = useMemo(() => createAttestContext(attest, chain), [attest, chain])

  const emit = (message: OutgoingEvent) => sendRef.current(message)

  const mint = async (base: SuccessMessage, issueCall: PopupAttestIssueCall, account: Account) => {
    const client = walletRef.current
    if (!client) {
      const reason = "Wallet disconnected before minting"
      setState({ step: "unminted", account, reason, base, issueCall })
      emit({ ...base, attest: { status: "unminted", walletAddress: account, reason, issueCall } })
      return
    }
    setState({ step: "minting", account })
    try {
      const wallet = { account: client.account.address, client }
      const txHash = await mintCredential(ctx, issueCall, wallet)
      setState({ step: "minted", account, txHash })
      emit({ ...base, attest: { status: "minted", walletAddress: account, txHash, issueCall } })
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setState({ step: "unminted", account, reason: message, base, issueCall })
      emit({
        ...base,
        attest: { status: "unminted", walletAddress: account, reason: message, issueCall },
      })
    }
  }
  const mintRef = useRef(mint)
  mintRef.current = mint

  const startWithAccount = (account: Account) => {
    const attempt = ++attemptRef.current
    const stale = () => attemptRef.current !== attempt
    setCardOptions(null)
    setState({ step: "checking", account })

    const run = async () => {
      const policyId = BigInt(attest.policyId)

      if (await hasCredential(ctx, account, policyId)) {
        if (stale()) return
        setState({ step: "already-verified", account })
        emit({
          type: "success",
          proofs: [],
          result: {},
          attest: { status: "already-verified", walletAddress: account },
        })
        return
      }

      const options = await buildAttestCardOptions({
        client: ctx.publicClient as never,
        registryAddress: attest.registry,
        policyId,
        wallet: account,
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
        onReject: () => emit({ type: "rejected" }),
        onError: (message) => emit({ type: "error", message: String(message) }),
        onResult: (result) => {
          if (stale()) return
          const base = toSuccessMessage(result.raw)
          if (!result.verified || !result.issueCall) {
            emit(base)
            return
          }
          void mintRef.current(base, result.issueCall as PopupAttestIssueCall, account)
        },
      })
      if (stale()) return
      setCardOptions(options)
      setState({ step: "verify", account })
    }

    run().catch((reason: unknown) => {
      if (stale()) return
      const message = reason instanceof Error ? reason.message : String(reason)
      setState({ step: "error", message })
      emit({ type: "error", message })
    })
  }

  const backToSelect = () => {
    ++attemptRef.current
    setCardOptions(null)
    setState({ step: "select" })
  }

  // The wallet's authorized accounts; the active one leads the list.
  const accountChoices = useMemo(() => {
    const all = (addresses ?? (activeAddress ? [activeAddress] : [])) as Account[]
    if (!activeAddress) return all
    return [activeAddress as Account, ...all.filter((a) => a !== activeAddress)]
  }, [addresses, activeAddress])

  const selectedAccount = chosen && accountChoices.includes(chosen) ? chosen : accountChoices[0]

  const connectPrompt = (
    <div style={styles.column}>
      <p className="zkp-intro-question-text" style={styles.centeredText}>
        Connect the wallet you want the credential minted to. It also pays for the mint transaction.
      </p>
      <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      {injectedOnly ? (
        <p className="zkp-intro-question-hint" style={styles.centeredText}>
          WalletConnect is not configured for this deployment; browser extension wallets only.
        </p>
      ) : null}
    </div>
  )

  const reconnectPrompt = (
    <div style={styles.column} role="status">
      <p style={styles.notice}>
        Wallet disconnected — reconnect it so the credential can be minted after verification.
      </p>
      <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
    </div>
  )

  // The QR card step draws its own zkp-card box; every other step borrows the
  // same box via CardFrame so the whole flow reads as one bounded card.
  if (state.step === "verify" || state.step === "minting") {
    return (
      <>
        {state.step === "verify" ? (
          <button type="button" style={styles.linkButton} onClick={backToSelect}>
            ← Use a different account ({shortAddress(state.account)})
          </button>
        ) : null}
        {cardOptions ? <ZKPassportQRCode {...cardOptions} showIntroScreen /> : null}
        {!isConnected ? reconnectPrompt : null}
        {state.step === "minting" ? (
          <p style={styles.notice} role="status">
            Confirm the mint transaction in your wallet — the credential goes to{" "}
            {shortAddress(state.account)}.
          </p>
        ) : null}
      </>
    )
  }

  return <CardFrame logo={request.logo}>{renderBoxedStep()}</CardFrame>

  function renderBoxedStep() {
    if (state.step === "select" && !isConnected) return connectPrompt
    switch (state.step) {
      case "select":
        return (
          <div style={styles.column}>
            <p className="zkp-intro-question-text" style={styles.centeredText}>
              Connect your wallet to mint your ZKPassport identity credential
            </p>
            <div style={styles.accountList} role="radiogroup">
              {accountChoices.map((account) => (
                <button
                  key={account}
                  type="button"
                  role="radio"
                  aria-checked={account === selectedAccount}
                  style={{
                    ...styles.accountOption,
                    ...(account === selectedAccount ? styles.accountOptionSelected : {}),
                  }}
                  onClick={() => setChosen(account)}
                >
                  <span aria-hidden="true" style={styles.radioDot}>
                    {account === selectedAccount ? "●" : "○"}
                  </span>
                  {shortAddress(account)}
                </button>
              ))}
            </div>
            <p className="zkp-intro-question-hint" style={styles.centeredText}>
              Missing an account? Authorize it in your wallet and it will appear here.
            </p>
            <button
              type="button"
              className="zkp-intro-continue"
              disabled={!selectedAccount}
              onClick={() => selectedAccount && startWithAccount(selectedAccount)}
            >
              Continue
            </button>
          </div>
        )
      case "checking":
        return (
          <p className="zkp-intro-question-hint" style={styles.centeredText}>
            Checking {shortAddress(state.account)} against the verification policy…
          </p>
        )
      case "already-verified":
        return (
          <div style={styles.column}>
            <p className="zkp-intro-question-text" style={styles.centeredText}>
              {shortAddress(state.account)} already holds this credential. You're all set.
            </p>
            <button type="button" className="zkp-intro-continue" onClick={() => window.close()}>
              Return to the app
            </button>
            <button type="button" className="zkp-intro-link" onClick={backToSelect}>
              Use a different account
            </button>
          </div>
        )
      case "minted":
        return (
          <div style={styles.column}>
            <p className="zkp-intro-question-text" style={styles.centeredText}>
              Credential minted to {shortAddress(state.account)}.
            </p>
            <p className="zkp-intro-question-hint" style={styles.centeredText}>
              tx {state.txHash.slice(0, 10)}…
            </p>
            <button type="button" className="zkp-intro-continue" onClick={() => window.close()}>
              Return to the app
            </button>
          </div>
        )
      case "unminted":
        return (
          <div style={styles.column}>
            <p className="zkp-intro-question-text" style={styles.centeredText}>
              Verification succeeded, but the credential wasn't minted to{" "}
              {shortAddress(state.account)}.
            </p>
            <p className="zkp-intro-question-hint" style={styles.centeredText}>
              {state.reason}
            </p>
            {isConnected ? (
              <button
                type="button"
                className="zkp-intro-continue"
                onClick={() => void mintRef.current(state.base, state.issueCall, state.account)}
              >
                Try minting again
              </button>
            ) : (
              <>
                <p className="zkp-intro-question-hint" style={styles.centeredText}>
                  Reconnect a wallet to try minting again.
                </p>
                <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
              </>
            )}
            <button type="button" className="zkp-intro-link" onClick={backToSelect}>
              Start over with a different account
            </button>
          </div>
        )
      case "error":
        return (
          <p className="zkp-intro-question-text" style={styles.centeredText}>
            {state.message}
          </p>
        )
    }
  }
}

// data-theme mirrors the QR card's default ("auto") so both boxes always
// resolve to the same light/dark palette; the header row matches the card's.
function CardFrame({ logo, children }: { logo?: string; children: React.ReactNode }) {
  return (
    <div className="zkp-card" data-theme="auto" style={styles.cardFrame}>
      <div className="zkp-header">
        <div className="zkp-header-icons">
          <div className="zkp-zkp-icon" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
          {logo ? (
            <>
              <div className="zkp-header-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="zkp-app-icon-slot">
                <img className="zkp-app-icon" src={logo} alt="" />
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div style={styles.cardBody}>{children}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  cardFrame: {
    gap: 12,
  },
  cardBody: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
  },
  column: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
  },
  accountList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    width: 260,
  },
  centeredText: {
    textAlign: "center",
    maxWidth: 300,
  },
  accountOption: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--zkp-border)",
    background: "var(--zkp-bg)",
    color: "var(--zkp-fg)",
    fontSize: 14,
    fontFamily: "ui-monospace, monospace",
    cursor: "pointer",
    textAlign: "center",
  },
  accountOptionSelected: {
    borderColor: "var(--zkp-brand)",
    boxShadow: "0 0 0 1px var(--zkp-brand)",
  },
  radioDot: {
    marginRight: 8,
    color: "var(--zkp-brand)",
  },
  linkButton: {
    padding: 4,
    border: "none",
    background: "none",
    color: "#6b7280",
    fontSize: 13,
    textDecoration: "underline",
    cursor: "pointer",
  },
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
