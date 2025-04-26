import { PackagedCertificate } from "@zkpassport/utils"
import { ChildProcess, execSync, spawn } from "child_process"
import fs from "fs"
import keccak256 from "keccak256"
import path from "path"

// Configuration
export const CHAIN_ID = 31337
export const PORT = 9545
export const RPC_URL = `http://localhost:${PORT}`
export const ORACLE_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export const CONTRACTS_DIR = path.resolve(__dirname, "../../../registry-contracts")

/**
 * Utility to log only if verbose mode is enabled
 */
export function verboseLog(...args: unknown[]): void {
  if (process.env.VERBOSE) {
    console.log(...args)
  }
}

/**
 * Represents a running Anvil instance with deployed contracts
 */
export interface AnvilInstance {
  anvilProcess: ChildProcess
  rootRegistry: string
  registryHelper: string
}

/**
 * Utility to check if Anvil is running
 * Uses fetch to check RPC endpoint availability
 * This is a low-level function used by waitForAnvil
 */
export async function isAnvilRunning(timeout = 1000): Promise<boolean> {
  try {
    // Add timeout to the fetch request to avoid hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout) // 3 second timeout
    try {
      // Test by calling eth_blockNumber
      const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_blockNumber",
          params: [],
          id: 1,
        }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (response?.ok) {
        const result = await response.json()
        return result.result !== undefined && !result.error
      }
      return false
    } catch (error: unknown) {
      clearTimeout(timeoutId)
      // Handle specific fetch errors
      const fetchError = error as { name?: string; code?: string }
      if (fetchError.name === "AbortError") {
        verboseLog("Request timeout checking Anvil")
      } else if (fetchError.code === "ECONNREFUSED" || fetchError.code === "ConnectionRefused") {
        verboseLog("Connection refused checking Anvil - server might still be starting")
      } else {
        verboseLog("Error checking Anvil:", error)
      }
      return false
    }
  } catch (error) {
    if (process.env.VERBOSE) {
      console.error("Unexpected error checking Anvil:", error)
    }
    return false
  }
}

/**
 * Waits for Anvil to be ready and accepting connections
 * @param timeout Maximum time to wait in milliseconds
 * @param checkInterval Interval between checks in milliseconds
 * @returns Promise resolving to true if Anvil is running, false otherwise
 */
export async function waitForAnvil(timeout = 3000, checkInterval = 100): Promise<boolean> {
  const startTime = Date.now()
  let attemptCount = 0
  // Initial wait to ensure anvil is ready
  await new Promise((resolve) => setTimeout(resolve, 50))
  // Wait for Anvil to be ready
  while (Date.now() - startTime < timeout) {
    attemptCount++
    verboseLog(
      `Checking if Anvil is running (attempt ${attemptCount}, elapsed: ${
        Date.now() - startTime
      }ms)...`,
    )
    if (await isAnvilRunning()) return true
    // Don't wait if we've already exceeded the max wait time
    if (Date.now() - startTime + checkInterval >= timeout) break
    // Wait for next check
    await new Promise((resolve) => setTimeout(resolve, checkInterval))
  }
  console.error(`Failed to connect to Anvil after ${Date.now() - startTime}ms`)
  return false
}

/**
 * Utility function to send a transaction to a contract
 */
export async function sendTransaction(to: string, data: string, from: string): Promise<string> {
  try {
    // First get nonce
    const nonceResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getTransactionCount",
        params: [from, "latest"],
      }),
    })

    const nonceResult = await nonceResponse.json()
    const nonce = nonceResult.result

    // Send transaction
    const txResponse = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendTransaction",
        params: [{ from, to, data, nonce }],
      }),
    })

    const txResult = await txResponse.json()
    if (txResult.error) {
      throw new Error(txResult.error.message || "Error sending transaction")
    }

    // Wait for transaction to be mined
    const txHash = txResult.result
    let receipt = null
    for (let i = 0; i < 10; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))

      const receiptResponse = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      })

      const receiptResult = await receiptResponse.json()
      if (receiptResult.result) {
        receipt = receiptResult.result
        break
      }
    }

    if (!receipt) {
      throw new Error("Transaction not mined")
    }

    return txHash
  } catch (error) {
    console.error("Error sending transaction:", error)
    throw error
  }
}

/**
 * Starts an Anvil instance for testing
 * @param maxWaitTimeMs Maximum time to wait for Anvil to start in milliseconds
 * @returns Anvil process information
 */
export async function startAnvil({
  maxWaitTimeMs = 15000,
  verbose = false,
}: {
  maxWaitTimeMs?: number
  verbose?: boolean
} = {}): Promise<AnvilInstance> {
  // Make sure there's no anvil running on the port
  try {
    execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: "ignore" })
  } catch (error) {
    console.error("Error killing Anvil process:", error)
  }

  // Run Anvil as a child process
  if (verbose) console.log("Starting Anvil...")
  const anvilProcess = spawn("anvil", ["--port", `${PORT}`], {
    detached: false,
    stdio: ["ignore", "ignore", "ignore"], // Hide stdin, stdout, and stderr
  })
  if (verbose) console.log("Anvil started with PID:", anvilProcess.pid)

  // Wait for Anvil to be ready
  const isRunning = await waitForAnvil(maxWaitTimeMs)
  if (!isRunning) throw new Error("Failed to start Anvil")

  // Build and deploy contracts
  if (verbose) console.log("Building contracts...")
  execSync(`cd ${CONTRACTS_DIR} && forge build`, {
    stdio: verbose ? "inherit" : "ignore",
  })
  if (verbose) console.log("Deploying contracts...")
  const deployOutput = execSync(`cd ${CONTRACTS_DIR} && script/bash/deploy.sh`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
    env: { RPC_URL },
  })
  if (verbose) verboseLog(deployOutput)

  // Get root registry address from deployment output
  const registryAddress = deployOutput.match(/RootRegistry deployed at: (0x[a-fA-F0-9]{40})/)?.[1]
  if (!registryAddress)
    throw new Error("Could not extract root registry address from deployment output")

  const helperAddress = deployOutput.match(/RegistryHelper deployed at: (0x[a-fA-F0-9]{40})/)?.[1]
  if (!helperAddress) throw new Error("Could not extract helper address from deployment output")

  // Update roots
  if (verbose) console.log("Updating roots...")
  const updateRootsOutput = execSync(`cd ${CONTRACTS_DIR} && script/bash/update-roots.sh`, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "ignore"],
    env: {
      RPC_URL: RPC_URL,
    },
  })
  verboseLog(updateRootsOutput)

  return { anvilProcess, rootRegistry: registryAddress, registryHelper: helperAddress }
}

/**
 * Stops a running Anvil instance
 * @param instance The Anvil instance to stop
 */
export async function stopAnvil(instance: AnvilInstance): Promise<void> {
  // Kill the Anvil process if it exists
  if (instance.anvilProcess && instance.anvilProcess.pid) {
    try {
      instance.anvilProcess.kill("SIGINT")
    } catch (error) {
      console.error("Error stopping Anvil process:", error)
    }
  }
}

/**
 * Calculates Ethereum function selector for a given function signature
 * @param functionSignature - The function signature (e.g., "latestRoot(bytes32)")
 * @returns The 4-byte function selector as a 0x-prefixed hex string
 */
export function getEthereumFunctionSelector(functionSignature: string): string {
  // Calculate the keccak256 hash of the function definition
  const hash = keccak256(functionSignature)
  // Take the first 4 bytes of the hash and format as 0x-prefixed hex string
  return "0x" + Buffer.from(hash.slice(0, 4)).toString("hex")
}

export function loadPackagedCertificates(filePath: string): PackagedCertificate[] {
  try {
    // Read and parse file
    const fileData = fs.readFileSync(filePath, "utf8")
    const fileJson = JSON.parse(fileData)
    return fileJson.certificates
  } catch (_) {
    throw new Error(`Error loading packaged certificates: ${filePath}`)
  }
}
