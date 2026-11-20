import { useEffect, useMemo, useState } from "react"
import { useConnection, useDisconnect } from "wagmi"
import { BaseError, type Chain } from "viem"
import { createCredentialsContext } from "@zkpassport/onchain-credentials"
import type { PopupRequestConfig } from "@zkpassport/sdk/popup"

import { FlowCard } from "../shared/flow-card"
import { ErrorScreen } from "../shared/error"
import { Primary } from "../shared/controls"
import { FlowBody, WalletProviders } from "../mint"
import { Resolving } from "../mint/resolving"
import { Connect } from "../mint/wallet"
import { resolveWalletChain } from "../mint/wagmi"
import { parseMintLink, type MintLink } from "./mint-link"

const FALLBACK_NAME = "Credential"
const METADATA_TIMEOUT_MS = 5_000

type PolicyDetails =
  | { status: "loading" }
  | { status: "unavailable"; message: string; retryable: boolean }
  | { status: "ready"; request: PopupRequestConfig }

/**
 * The hosted mint page, opened from a link to a credential policy rather than by a website: the
 * holder connects a wallet, proves the policy, and mints the credential to that wallet.
 */
export function MintPage() {
  const link = useMemo(() => parseMintLink(window.location.search), [])
  if ("error" in link) return <ErrorCard message={link.error} />
  return <MintFromLink link={link} />
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <FlowCard name={FALLBACK_NAME} screenKey="error">
      <ErrorScreen message={message} onRetry={onRetry} closable={false} />
    </FlowCard>
  )
}

function MintFromLink({ link }: { link: MintLink }) {
  const resolved = useMemo(() => resolveWalletChain(link.chain), [link.chain])
  if ("error" in resolved) return <ErrorCard message={resolved.error} />
  return (
    <WalletProviders config={resolved.config}>
      <MintBody link={link} chain={resolved.chain} />
    </WalletProviders>
  )
}

function MintBody({ link, chain }: { link: MintLink; chain: Chain }) {
  const { address } = useConnection()
  const disconnect = useDisconnect()
  const [reads, setReads] = useState(0)
  const details = usePolicyDetails(chain, link.policyId, reads)
  // A renewal is for the wallet that asked for it; another wallet starts from the beginning
  const [renewFor, setRenewFor] = useState<`0x${string}` | null>(null)

  if (details.status === "loading") {
    return (
      <FlowCard name={FALLBACK_NAME} screenKey="loading">
        <Resolving />
      </FlowCard>
    )
  }
  if (details.status === "unavailable") {
    return (
      <ErrorCard
        message={details.message}
        onRetry={details.retryable ? () => setReads((count) => count + 1) : undefined}
      />
    )
  }

  const appName = details.request.name ?? FALLBACK_NAME
  if (!address) {
    return (
      <FlowCard name={appName} logo={details.request.logo} screenKey="connect">
        <Connect
          title="Connect your wallet"
          hint="The credential goes to this wallet, which also pays a small network fee."
          verified={false}
        />
      </FlowCard>
    )
  }

  const renew = renewFor !== null && renewFor.toLowerCase() === address.toLowerCase()
  return (
    <FlowBody
      key={`${address}:${renew}`}
      request={details.request}
      credential={{ chain: link.chain, policyId: link.policyId, recipient: address }}
      appName={appName}
      rpHost={window.location.hostname}
      send={() => {}}
      chain={chain}
      renew={renew}
      onChangeWallet={() => disconnect.mutate()}
      doneActions={(step) =>
        step.outcome === "already-verified" ? (
          <Primary onClick={() => setRenewFor(address)}>Renew now</Primary>
        ) : null
      }
    />
  )
}

/** The policy's name, image and description from its metadata, once the policy is known to be live. */
function usePolicyDetails(chain: Chain, policyId: `0x${string}`, reads: number): PolicyDetails {
  const [details, setDetails] = useState<PolicyDetails>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    setDetails({ status: "loading" })

    const read = async (): Promise<PolicyDetails> => {
      const { credentials } = createCredentialsContext(chain)
      const policy = await credentials.findPolicy(BigInt(policyId))
      if (!policy) {
        return {
          status: "unavailable",
          message: `There is no credential with this ID on ${chain.name}.`,
          retryable: false,
        }
      }
      if (policy.retiredAt > 0n) {
        return {
          status: "unavailable",
          message: `This credential was retired on ${chain.name}, so it can't be minted any more.`,
          retryable: false,
        }
      }
      return { status: "ready", request: await readMetadata(policy.metadataURL) }
    }

    read()
      .then((result) => {
        if (!cancelled) setDetails(result)
      })
      .catch((reason: unknown) => {
        if (cancelled) return
        const detail =
          reason instanceof BaseError
            ? reason.shortMessage
            : reason instanceof Error
              ? reason.message
              : String(reason)
        setDetails({
          status: "unavailable",
          message: `Could not read the credential from ${chain.name}: ${detail}`,
          retryable: true,
        })
      })

    return () => {
      cancelled = true
    }
  }, [chain, policyId, reads])

  return details
}

// The page still works without the metadata, under a generic name
async function readMetadata(url: string): Promise<PopupRequestConfig> {
  if (!url) return {}
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) })
    if (!response.ok) return {}
    const body: unknown = await response.json()
    if (typeof body !== "object" || body === null) return {}
    return {
      name: stringField(body, "name"),
      logo: stringField(body, "image"),
      purpose: stringField(body, "description"),
    }
  } catch {
    return {}
  }
}

function stringField(body: object, key: string): string | undefined {
  const value: unknown = Object.entries(body).find(([name]) => name === key)?.[1]
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined
}
