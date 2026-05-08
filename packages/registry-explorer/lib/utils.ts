import { strip0x } from "@zkpassport/utils"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalise a hash to a 64 character lowercase hex string
 * @param hash - The hash to normalise
 * @returns The normalised hash
 */
export function normalizeHash(hash: string | bigint): string {
  if (typeof hash === "bigint") {
    return `0x${hash.toString(16).toLowerCase().padStart(64, "0")}`
  }
  return `0x${strip0x(hash).toLowerCase().padStart(64, "0")}`
}
