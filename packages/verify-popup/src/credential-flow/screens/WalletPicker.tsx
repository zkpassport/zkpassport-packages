import { ProviderNotFoundError, useConnect, useConnectors, type Connector } from "wagmi"
import { BaseError, UserRejectedRequestError } from "viem"

import { Hint } from "./primitives"

// Wagmi lists every wallet announced via EIP-6963 as its own connector, plus the
// plain injected one for wallets that only set window.ethereum. The plain one is
// offered only when nothing was announced, so no wallet shows up twice.
function offeredWallets(connectors: readonly Connector[]): readonly Connector[] {
  const announced = connectors.filter((connector) => connector.id !== "injected")
  return announced.length > 0 ? announced : connectors
}

export function WalletPicker() {
  const wallets = offeredWallets(useConnectors())
  const connect = useConnect()

  return (
    <>
      <ul className="zkp-flow-wallets">
        {wallets.map((connector) => (
          <li key={connector.uid}>
            <button
              type="button"
              className="zkp-flow-wallet"
              disabled={connect.isPending}
              onClick={() => connect.mutate({ connector })}
            >
              {connector.icon ? <img src={connector.icon} alt="" /> : null}
              <span>{connector.id === "injected" ? "Browser wallet" : connector.name}</span>
            </button>
          </li>
        ))}
      </ul>
      {connect.error ? <Hint>{describeConnectError(connect.error)}</Hint> : null}
    </>
  )
}

function describeConnectError(error: Error): string {
  if (error instanceof ProviderNotFoundError) {
    return "No browser wallet found. Install a wallet extension and reload this page."
  }
  if (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof UserRejectedRequestError)
  ) {
    return "Connection cancelled in your wallet."
  }
  return "Could not connect to the wallet."
}
