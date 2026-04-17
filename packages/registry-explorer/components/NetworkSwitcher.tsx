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
  const { chainId, setChainId, availableNetworks, currentNetwork } = useNetwork()

  return (
    <Select value={String(chainId)} onValueChange={(v) => setChainId(Number(v))}>
      <SelectTrigger
        className={`h-9 w-auto gap-2 rounded-full border-border bg-background px-3 text-sm font-medium cursor-pointer ${className ?? ""}`}
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
