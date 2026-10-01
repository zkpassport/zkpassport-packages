import { ProviderNotFoundError, useConnect, useConnectors, type Connector } from "wagmi"
import { BaseError, UserRejectedRequestError } from "viem"

import { walletLabel } from "../shared/controls"
import { Heading, Main, Note, VerifiedBadge } from "../shared/controls"

// Wagmi lists every wallet announced via EIP-6963 as its own connector, plus a
// plain injected one for wallets that only set window.ethereum. The plain one is
// dropped only when an extension announced itself, so no wallet shows up twice.
function offeredWallets(connectors: readonly Connector[]): readonly Connector[] {
  const announced = connectors.some(
    (connector) => connector.type === "injected" && connector.id !== "injected",
  )
  return announced ? connectors.filter((connector) => connector.id !== "injected") : connectors
}

export function WalletPicker() {
  const wallets = offeredWallets(useConnectors())
  const connect = useConnect()

  return (
    <>
      <ul className="flow-wallets">
        {wallets.map((connector) => (
          <li key={connector.uid}>
            <button
              type="button"
              className="flow-wallet"
              disabled={connect.isPending}
              onClick={() => connect.mutate({ connector })}
            >
              {connector.icon ? <img src={connector.icon} alt="" /> : null}
              <span>{walletLabel(connector)}</span>
            </button>
          </li>
        ))}
      </ul>
      {connect.error ? <Note alert>{describeConnectError(connect.error)}</Note> : null}
    </>
  )
}

function describeConnectError(error: Error): string {
  if (error instanceof ProviderNotFoundError) {
    return "No wallet found. Install a wallet extension, then reload this page."
  }
  if (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof UserRejectedRequestError)
  ) {
    return "You cancelled the connection."
  }
  return "Could not connect to that wallet."
}

export function Connect() {
  return (
    <div className="flow-body">
      <Main>
        <Heading
          title="Connect a wallet"
          hint="The wallet you pick pays a small network fee."
          badge={<VerifiedBadge />}
        />
        <WalletPicker />
      </Main>
    </div>
  )
}
