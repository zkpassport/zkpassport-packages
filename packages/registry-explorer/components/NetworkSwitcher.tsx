"use client"

import { useNetwork } from "@/components/NetworkProvider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Globe } from "lucide-react"

interface NetworkSwitcherProps {
  className?: string
}

export function NetworkSwitcher({ className }: NetworkSwitcherProps) {
  const { setNetwork, availableNetworks, currentNetwork, isReady } = useNetwork()

  // Avoid flashing the SSR-default network (Mainnet) before the persisted
  // selection has been resolved from localStorage on the client.
  if (!isReady) {
    return (
      <div
        className={`[min-width:130px] h-9 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 text-sm font-medium text-muted-foreground ${className ?? ""}`}
        aria-label="Loading network"
        aria-busy="true"
      >
        <Globe className="h-4 w-4 text-muted-foreground" />
        <span className="inline-block h-3 [width:75px] rounded bg-muted animate-pulse" />
      </div>
    )
  }

  return (
    <Select value={String(currentNetwork.id)} onValueChange={(v) => setNetwork(Number(v))}>
      <SelectTrigger
        className={`[min-width:130px] h-9 w-auto gap-2 rounded-full border-border bg-background px-3 text-sm font-medium cursor-pointer ${className ?? ""}`}
        aria-label="Select network"
      >
        <Globe className="h-4 w-4 text-muted-foreground" />
        <SelectValue>{currentNetwork.shortLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {availableNetworks.map((network) => (
          <SelectItem key={network.id} value={String(network.id)} className="cursor-pointer">
            {network.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
