import { Main } from "../shared/controls"
import { AsksLoading } from "../verify/intro"

// The same panel the consent screen fills in, so resolving the policy reads as
// the request arriving rather than as a different screen
export function Resolving() {
  return (
    <div className="flow-body" role="status" aria-label="Preparing verification">
      <Main>
        <div className="intro-asks">
          <p className="intro-asks-head">Preparing your request</p>
          <AsksLoading />
        </div>
      </Main>
    </div>
  )
}
