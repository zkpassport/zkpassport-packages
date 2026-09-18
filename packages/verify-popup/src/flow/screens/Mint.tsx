import type { Chain } from "viem"
import type { Connector } from "wagmi"

import { walletHasTransaction, type MintPhase } from "../use-credential-flow"
import { walletLabel } from "./format"
import {
  Actions,
  Address,
  AddressLink,
  ErrorDetail,
  Heading,
  Main,
  Note,
  Panel,
  Primary,
  Rows,
  TxLink,
  VerifiedBadge,
  type Row,
} from "./primitives"

type MintProps = {
  recipient: `0x${string}`
  payer: `0x${string}`
  connector?: Connector
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
  const { recipient, payer, connector, chain, onRightChain, phase, onChangeWallet } = props
  const payerDiffers = payer.toLowerCase() !== recipient.toLowerCase()

  // Anyone can pay, so the connected wallet is not where the token lands
  const rows: Row[] = [
    { label: "Token goes to", value: <AddressLink chain={chain} address={recipient} /> },
    { label: "Network", value: chain.name },
  ]
  // Once the transaction is out there, the receipt belongs with the other facts,
  // so the button below never moves to make room for it
  const hash = phase.kind === "pending" || phase.kind === "unconfirmed" ? phase.hash : null
  if (hash) {
    rows.push({ label: "Transaction", value: <TxLink chain={chain} hash={hash} /> })
  }

  return (
    <div className="zkp-flow-body">
      <Main>
        <Heading title="Mint your verification" badge={<VerifiedBadge />} />
        <Panel>
          <div className="zkp-flow-wallet-row">
            {connector?.icon ? <img src={connector.icon} alt="" /> : null}
            <span className="zkp-flow-wallet-who">
              <span className="zkp-flow-wallet-name">{walletLabel(connector)}</span>
              <Address value={payer} />
            </span>
            {/* Swapping wallets after the transaction is handed over would only
                strand the user on the connect screen while it lands */}
            {walletHasTransaction(phase) ? null : (
              <button type="button" className="zkp-flow-ghost" onClick={onChangeWallet}>
                Change
              </button>
            )}
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

// Either what went wrong, or what the token holds — never both, and never nothing
function MintNote({
  chain,
  onRightChain,
  phase,
  payerDiffers,
}: MintProps & { payerDiffers: boolean }) {
  if (!onRightChain) {
    return <Note alert>This wallet is on another network. Switch it to {chain.name} to go on.</Note>
  }
  switch (phase.kind) {
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
      return <Note alert>You cancelled the transaction.</Note>
    }
    default:
      return (
        <Note>
          The token holds no personal data. It only proves you passed the check.
          {payerDiffers ? " This wallet only pays the fee." : ""}
        </Note>
      )
  }
}

// Exactly one thing to do at a time: switch network, mint, or recover
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
  switch (phase.kind) {
    case "preflight":
      return (
        <Primary busy onClick={onMint}>
          Checking…
        </Primary>
      )
    case "signing":
      return (
        <Primary busy onClick={onMint}>
          Confirm in wallet
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
      return <Primary onClick={onMint}>Mint</Primary>
    }
    case "ready":
      return <Primary onClick={onMint}>Mint</Primary>
  }
}
