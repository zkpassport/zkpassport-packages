import type { Chain } from "viem"

import type { MintPhase } from "../use-credential-flow"
import { shortHex } from "./format"
import { Hint, LinkButton, Primary, Rows, Status, Title, TxLink } from "./primitives"
import { WalletPicker } from "./WalletPicker"

type MintProps = {
  recipient: `0x${string}`
  payer?: `0x${string}`
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
  const { recipient, payer, chain } = props
  return (
    <div className="zkp-flow-body">
      <Title>Verification succeeded.</Title>
      <Rows
        rows={[
          { label: "Credential goes to", value: recipient, stacked: true },
          { label: "Paying with", value: payer ? shortHex(payer) : "No wallet connected" },
          { label: "Network", value: chain.name },
        ]}
      />
      <MintAction {...props} />
    </div>
  )
}

// Exactly one thing to do at a time: connect, switch network, mint, or recover
function MintAction({
  recipient,
  payer,
  chain,
  onRightChain,
  phase,
  onSwitchChain,
  onMint,
  onChangeWallet,
  onStartOver,
  onCheckTransaction,
}: MintProps) {
  if (!payer) {
    return (
      <>
        <Hint>Connect a wallet to pay for the mint transaction.</Hint>
        <WalletPicker />
      </>
    )
  }
  if (!onRightChain) {
    return (
      <>
        <Hint>Switch your wallet to {chain.name} to mint.</Hint>
        <Primary onClick={onSwitchChain}>Switch to {chain.name}</Primary>
        <LinkButton onClick={onChangeWallet}>Use a different wallet</LinkButton>
      </>
    )
  }
  switch (phase.name) {
    case "preflight":
      return <Status>Checking the transaction…</Status>
    case "signing":
      return (
        <Status>
          Confirm the mint transaction in your wallet — the credential goes to {shortHex(recipient)}
          .
        </Status>
      )
    case "pending":
      return (
        <>
          <Status>Minting…</Status>
          <TxLink chain={chain} hash={phase.hash} label="View transaction" />
        </>
      )
    case "unconfirmed":
      return (
        <>
          <Status>The transaction was sent, but we couldn't confirm it.</Status>
          <TxLink chain={chain} hash={phase.hash} label="View transaction" />
          <Primary onClick={onCheckTransaction}>Check again</Primary>
        </>
      )
    case "ready":
    case "failed": {
      const error = phase.name === "failed" ? phase.error : null
      if (error?.kind === "insufficient-funds") {
        return (
          <>
            <Hint>This wallet doesn't have enough ETH for the fee.</Hint>
            <Primary onClick={onChangeWallet}>Use a different wallet</Primary>
          </>
        )
      }
      if (error?.kind === "reverted") {
        return (
          <>
            <Hint>The mint would fail: {error.detail}.</Hint>
            <Primary onClick={onStartOver}>Start over</Primary>
          </>
        )
      }
      if (error?.kind === "failed") {
        return (
          <>
            <Hint>Transaction failed. {error.detail}</Hint>
            <Primary onClick={onMint}>Try again</Primary>
            <LinkButton onClick={onChangeWallet}>Use a different wallet</LinkButton>
          </>
        )
      }
      const payerDiffers = payer.toLowerCase() !== recipient.toLowerCase()
      return (
        <>
          {error ? <Hint>Transaction cancelled in your wallet.</Hint> : null}
          {!error && payerDiffers ? (
            <Hint>
              This wallet only pays the network fee; the credential still goes to{" "}
              {shortHex(recipient)}.
            </Hint>
          ) : null}
          <Primary onClick={onMint}>Mint credential</Primary>
          <LinkButton onClick={onChangeWallet}>Use a different wallet</LinkButton>
        </>
      )
    }
  }
}
