"use client"

import Link from "next/link"
import { useMemo } from "react"

import { DemoConfigError, type DemoConfig } from "../lib/config"
import { DemoProvider, loadConfig, useDemo } from "./demo-context"

function Header({ title }: { title: string }) {
  const { config, wallet, connect, connectError } = useDemo()
  return (
    <header className="mb-8 space-y-2 border-b border-slate-800 pb-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link className="text-sm text-sky-400 underline" href="/">
            ← All personas
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
        </div>
        {wallet ? (
          <span className="break-all text-sm text-slate-300">{wallet.account}</span>
        ) : (
          <button className="rounded bg-sky-600 px-4 py-2" type="button" onClick={connect}>
            Connect wallet
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {config.chain} · registry {config.registry}
      </p>
      {connectError && <p className="text-sm text-red-400">{connectError}</p>}
    </header>
  )
}

export function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  const result = useMemo((): { config: DemoConfig } | { error: string } => {
    try {
      return { config: loadConfig() }
    } catch (reason) {
      return {
        error: reason instanceof DemoConfigError ? reason.message : "Invalid demo configuration.",
      }
    }
  }, [])

  if ("error" in result) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Demo not configured</h1>
        <p className="mt-2 text-red-400">{result.error}</p>
        <p className="mt-2 text-slate-400">Copy .env.example to .env.local and fill it in.</p>
      </main>
    )
  }

  return (
    <DemoProvider config={result.config}>
      <main className="mx-auto max-w-3xl p-8">
        <Header title={title} />
        {children}
      </main>
    </DemoProvider>
  )
}
