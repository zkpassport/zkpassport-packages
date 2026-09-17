import type { Chain } from "viem"
import type { Connector } from "wagmi"

import type { MintPhase } from "../use-credential-flow"
import { walletLabel } from "./format"
import {
  Actions,
  Address,
  ErrorDetail,
  Heading,
  Main,
  Note,
  Panel,
  Primary,
  Rows,
  TxLink,
  type Row,
} from "./primitives"

type MintProps = {
  recipient: `0x${string}`
  payer: `0x${string}`
  wallet?: Connector
  chain: Chain
  onRightChain: boolean
  phase: MintPhase
  onSwitchChain: () => void
  onMint: () => void
  onChangeWallet: () => void
  onStartOver: () => void
  onCheckTransaction: () => void
}

export function Mint(props: MintProps) {
  const { recipient, payer, wallet, chain, onRightChain, phase, onChangeWallet } = props
  const payerDiffers = payer.toLowerCase() !== recipient.toLowerCase()

  const rows: Row[] = [{ label: "Network", value: chain.name }]
  if (payerDiffers) {
    rows.unshift({ label: "Verification goes to", value: <Address value={recipient} /> })
  }
  // Once the transaction is out there, the receipt belongs with the other facts,
  // so the button below never moves to make room for it
  const hash = phase.name === "pending" || phase.name === "unconfirmed" ? phase.hash : null
  if (hash) {
    rows.push({ label: "Transaction", value: <TxLink chain={chain} hash={hash} label="View" /> })
  }

  return (
    <div className="zkp-flow-body">
      <Main>
        <Heading title="Mint your verification" hint="You pay a small network fee." />
        <Panel>
          <div className="zkp-flow-wallet-row">
            {wallet?.icon ? <img src={wallet.icon} alt="" /> : null}
            <span className="zkp-flow-wallet-who">
              <span className="zkp-flow-wallet-name">{walletLabel(wallet)}</span>
              <Address value={payer} />
            </span>
            <button type="button" className="zkp-flow-ghost" onClick={onChangeWallet}>
              Change
            </button>
          </div>
          <Rows rows={rows} />
        </Panel>
        <MintNote {...props} payerDiffers={payerDiffers} />
      </Main>
      <Actions>
        <MintAction {...props} />
      </Actions>
    </div>
  )
}

// Either what went wrong, or what is being saved — never both, and never nothing
function MintNote({
  chain,
  onRightChain,
  phase,
  payerDiffers,
}: MintProps & { payerDiffers: boolean }) {
  if (!onRightChain) {
    return <Note alert>This wallet is on another network. Switch it to {chain.name} to go on.</Note>
  }
  switch (phase.name) {
    case "unconfirmed":
      return <Note alert>The transaction was sent, but we could not confirm it yet.</Note>
    case "failed": {
      const error = phase.error
      if (error.kind === "insufficient-funds") {
        return <Note alert>This wallet does not have enough {chain.nativeCurrency.symbol}.</Note>
      }
      if (error.kind === "reverted") {
        return (
          <>
            <Note alert>The verification cannot be minted from this wallet.</Note>
            {error.detail ? <ErrorDetail text={error.detail} /> : null}
          </>
        )
      }
      if (error.kind === "failed") {
        return (
          <>
            <Note alert>The transaction failed. Nothing was charged.</Note>
            {error.detail ? <ErrorDetail text={error.detail} /> : null}
          </>
        )
      }
      return <Note alert>You cancelled the transaction in this wallet.</Note>
    }
    default:
      return (
        <Note>
          It holds no personal details — only that you passed the check.
          {payerDiffers ? " This wallet only pays the fee." : ""}
        </Note>
      )
  }
}

// Exactly one thing to do at a time: switch network, save, or recover
function MintAction({
  chain,
  onRightChain,
  phase,
  onSwitchChain,
  onMint,
  onChangeWallet,
  onStartOver,
  onCheckTransaction,
}: MintProps) {
  if (!onRightChain) {
    return <Primary onClick={onSwitchChain}>Switch to {chain.name}</Primary>
  }
  switch (phase.name) {
    case "preflight":
      return (
        <Primary busy onClick={onMint}>
          Checking…
        </Primary>
      )
    case "signing":
      return (
        <Primary busy onClick={onMint}>
          Confirm in this wallet
        </Primary>
      )
    case "pending":
      return (
        <Primary busy onClick={onMint}>
          Sending transaction…
        </Primary>
      )
    case "unconfirmed":
      return <Primary onClick={onCheckTransaction}>Check again</Primary>
    case "failed": {
      const error = phase.error
      if (error.kind === "insufficient-funds") {
        return <Primary onClick={onChangeWallet}>Use another wallet</Primary>
      }
      if (error.kind === "reverted") {
        return <Primary onClick={onStartOver}>Start over</Primary>
      }
      if (error.kind === "failed") {
        return <Primary onClick={onMint}>Try again</Primary>
      }
      return <Primary onClick={onMint}>Mint verification</Primary>
    }
    case "ready":
      return <Primary onClick={onMint}>Mint verification</Primary>
  }
}
