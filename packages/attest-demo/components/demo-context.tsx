"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import type { Chain } from "viem"

import { resolveChain } from "../lib/chains"
import { loadConfig, type DemoConfig } from "../lib/config"
import { createAttestContext, type AttestContext } from "../lib/policies"
import {
  connectWallet,
  getInjectedProvider,
  onAccountsChanged,
  type ConnectedWallet,
} from "../lib/wallet"

type DemoValue = {
  config: DemoConfig
  chain: Chain
  ctx: AttestContext
  wallet: ConnectedWallet | null
  connect: () => Promise<void>
  connectError?: string
}

const DemoContext = createContext<DemoValue | null>(null)

export function DemoProvider({
  config,
  children,
}: {
  config: DemoConfig
  children: React.ReactNode
}) {
  const chain = useMemo(() => resolveChain(config.chain), [config.chain])
  const ctx = useMemo(() => createAttestContext(config, chain), [config, chain])
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null)
  const [connectError, setConnectError] = useState<string | undefined>()

  const connect = useCallback(async () => {
    try {
      setConnectError(undefined)
      setWallet(await connectWallet(chain, getInjectedProvider()))
    } catch (reason) {
      setConnectError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [chain])

  useEffect(() => onAccountsChanged(() => setWallet(null)), [])

  const value = useMemo(
    () => ({ config, chain, ctx, wallet, connect, connectError }),
    [config, chain, ctx, wallet, connect, connectError],
  )
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>
}

export function useDemo(): DemoValue {
  const value = useContext(DemoContext)
  if (!value) throw new Error("useDemo must be used inside DemoProvider")
  return value
}

export { loadConfig }
