import type { Chain } from "viem"

import type { MintPhase } from "../use-credential-flow"
import { ICON_REFRESH, ICON_SHIELD_CHECK, ICON_SWAP, ICON_WALLET } from "./icons"
import {
  Actions,
  AddressLink,
  ErrorDetail,
  Hint,
  LinkButton,
  Primary,
  Rows,
  Status,
  Title,
  TxLink,
  Working,
} from "./primitives"

type MintProps = {
  recipient: `0x${string}`
  payer: `0x${string}`
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
  const { recipient, payer, chain, phase } = props
  return (
    <div className="zkp-flow-body">
      <div className="zkp-flow-heading">
        <Title>One last step</Title>
        {phase.name === "ready" ? (
          <Hint>Your ID is verified. Now add the credential to your wallet.</Hint>
        ) : null}
      </div>
      <Rows
        rows={[
          {
            label: "Credential goes to",
            value: <AddressLink chain={chain} address={recipient} />,
          },
          { label: "Paying with", value: <AddressLink chain={chain} address={payer} /> },
          { label: "Network", value: chain.name },
        ]}
      />
      <Actions>
        <MintAction {...props} />
      </Actions>
    </div>
  )
}

// Exactly one thing to do at a time: switch network, mint, or recover
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
  if (!onRightChain) {
    return (
      <>
        <Hint>Switch your wallet to {chain.name} to mint.</Hint>
        <Primary icon={ICON_SWAP} onClick={onSwitchChain}>
          Switch to {chain.name}
        </Primary>
        <LinkButton onClick={onChangeWallet}>Use a different wallet</LinkButton>
      </>
    )
  }
  switch (phase.name) {
    case "preflight":
      return <Working>Checking the transaction…</Working>
    case "signing":
      return <Working>Confirm the transaction in your wallet.</Working>
    case "pending":
      return (
        <>
          <Working>Minting…</Working>
          <TxLink chain={chain} hash={phase.hash} label="View transaction" />
        </>
      )
    case "unconfirmed":
      return (
        <>
          <Status>The transaction was sent, but we couldn't confirm it.</Status>
          <TxLink chain={chain} hash={phase.hash} label="View transaction" />
          <Primary icon={ICON_REFRESH} onClick={onCheckTransaction}>
            Check again
          </Primary>
        </>
      )
    case "ready":
    case "failed": {
      const error = phase.name === "failed" ? phase.error : null
      if (error?.kind === "insufficient-funds") {
        return (
          <>
            <Hint>This wallet doesn't have enough ETH for the fee.</Hint>
            <Primary icon={ICON_WALLET} onClick={onChangeWallet}>
              Use a different wallet
            </Primary>
          </>
        )
      }
      if (error?.kind === "reverted") {
        return (
          <>
            <Hint>The mint would fail.</Hint>
            {error.detail ? <ErrorDetail text={error.detail} /> : null}
            <Primary icon={ICON_REFRESH} onClick={onStartOver}>
              Start over
            </Primary>
          </>
        )
      }
      if (error?.kind === "failed") {
        return (
          <>
            <Hint>Transaction failed.</Hint>
            {error.detail ? <ErrorDetail text={error.detail} /> : null}
            <Primary icon={ICON_REFRESH} onClick={onMint}>
              Try again
            </Primary>
            <LinkButton onClick={onChangeWallet}>Use a different wallet</LinkButton>
          </>
        )
      }
      const payerDiffers = payer.toLowerCase() !== recipient.toLowerCase()
      return (
        <>
          {error ? <Hint>Transaction cancelled in your wallet.</Hint> : null}
          {!error && payerDiffers ? <Hint>This wallet only pays the network fee.</Hint> : null}
          <Primary icon={ICON_SHIELD_CHECK} onClick={onMint}>
            Add to my wallet
          </Primary>
          <LinkButton onClick={onChangeWallet}>Use a different wallet</LinkButton>
        </>
      )
    }
  }
}
