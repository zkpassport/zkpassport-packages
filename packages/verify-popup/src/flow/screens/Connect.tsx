import { Heading, Main, VerifiedBadge } from "./primitives"
import { WalletPicker } from "./WalletPicker"

export function Connect() {
  return (
    <div className="zkp-flow-body">
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
