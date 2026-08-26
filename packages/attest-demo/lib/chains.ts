import type { Chain } from "viem"
import { sepolia } from "viem/chains"
import type { DemoConfig } from "./config"

export function resolveChain(chain: DemoConfig["chain"]): Chain {
  void chain
  return sepolia
}
