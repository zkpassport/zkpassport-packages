import { Actions, Hint, Title } from "./primitives"
import { WalletPicker } from "./WalletPicker"

export function Connect() {
  return (
    <div className="zkp-flow-body">
      <div className="zkp-flow-heading">
        <Title>Connect a wallet</Title>
        <Hint>Your wallet pays a small network fee to add the credential.</Hint>
      </div>
      <Actions>
        <WalletPicker />
      </Actions>
    </div>
  )
}
