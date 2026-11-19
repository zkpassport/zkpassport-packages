import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { RpcEndpointError, type RpcEndpointSession } from "./errors"
import { normaliseHash } from "./utils"

/**
 * Reads ZKPassportRegistry, ZKPassport's registry contract on an Aztec network, from an Aztec node's public storage.
 * Each value is read as the registry's private functions read it at the node's latest block: a change scheduled
 * within the registry's delay is ignored until its time comes. Each call reads all its values at one block, from one
 * node: when a node fails any part of the read, the whole read moves to the next node.
 */
export class AztecRegistryReader {
  /**
   * @param onNode - Runs a read against one Aztec node, moving it to the next node on an {@link RpcEndpointError}
   * @param registry - The address of the registry contract
   */
  constructor(
    private readonly onNode: RpcEndpointSession,
    private readonly registry: string,
  ) {}

  /**
   * Get the latest root of one of the registry's root sets
   * @param registryId - The certificate, circuit or sanctions registry ID
   */
  async getLatestRoot(registryId: number): Promise<string> {
    const [[latest]] = await this.readCurrentValues([
      { slot: await mapSlot(LATEST_SLOT, BigInt(registryId)), length: LATEST_ROOT_PAIR_LENGTH },
    ])

    return normaliseHash(latest)
  }

  /**
   * Check whether the registry accepts a root for a proof made at a timestamp
   * @param registryId - The certificate, circuit or sanctions registry ID
   * @param root - The root
   * @param timestamp - The proof's timestamp, in seconds
   */
  async isRootValid(registryId: number, root: string, timestamp: number): Promise<boolean> {
    const id = BigInt(registryId)
    const rootField = BigInt(normaliseHash(root))
    const [[paused], [mode, window], [latest, previous], [exists, revoked, validFrom, validTo]] =
      await this.readCurrentValues([
        { slot: PAUSED_SLOT, length: 1 },
        { slot: await mapSlot(CONFIG_SLOT, id), length: REGISTRY_CONFIG_LENGTH },
        { slot: await mapSlot(LATEST_SLOT, id), length: LATEST_ROOT_PAIR_LENGTH },
        {
          slot: await mapSlot(await mapSlot(ROOTS_SLOT, id), rootField),
          length: ROOT_STATUS_LENGTH,
        },
      ])

    if (paused !== 0n) {
      return false
    }
    return isRootValidInMode(
      mode,
      window,
      { latest, previous },
      { exists: exists !== 0n, revoked: revoked !== 0n, validFrom, validTo },
      rootField,
      BigInt(timestamp),
    )
  }

  /**
   * Reads the current value of each DelayedPublicMutable at the node's latest block. The block's number is read first
   * and every later read names it, as a block landing between "latest" reads would mix the slots of two blocks. A
   * DelayedPublicMutable holding a value of packed length N takes 2N + 2 slots: the scheduled change's timestamp
   * (the low 32 bits, packed with the delay's own scheduled change), the value before the change, the value after it,
   * and a hash of them all.
   */
  private async readCurrentValues(
    variables: { slot: bigint; length: number }[],
  ): Promise<bigint[][]> {
    const slots = variables.flatMap(({ slot, length }) =>
      Array.from({ length: 2 * length + 1 }, (_, offset) => slot + BigInt(offset)),
    )
    const { now, values } = await this.onNode(async (post) => {
      const [blockNumber] = await request(post, [{ method: "node_getBlockNumber", params: [] }])
      const [block, ...words] = await request(post, [
        { method: "node_getBlockData", params: [blockNumber] },
        ...slots.map((slot) => ({
          method: "node_getPublicStorageAt",
          params: [blockNumber, this.registry, normaliseHash(slot)],
        })),
      ])
      return {
        now: BigInt(readBlockTimestamp(block, blockNumber)),
        values: words.map((word) => BigInt(String(word))),
      }
    })

    let offset = 0
    return variables.map(({ length }) => {
      const changeTimestamp = values[offset] & 0xffffffffn
      const before = values.slice(offset + 1, offset + 1 + length)
      const after = values.slice(offset + 1 + length, offset + 1 + 2 * length)
      offset += 2 * length + 1
      return now < changeTimestamp ? before : after
    })
  }
}

/**
 * Sends `calls` to an Aztec node in one JSON-RPC batch and returns their results in order. Every failure of the node's
 * answer is an {@link RpcEndpointError}, so the read moves to another node: an error status, a reply that isn't the
 * batch, a missing reply, and a reply with an error of any code. An Aztec node answers a batch with HTTP 200 and puts
 * each call's error in its reply, and each code it uses can come from that node alone: -32601 from its version's
 * methods, -32701 from its version's parameter schemas, -32702 from its state (such as a block it doesn't have),
 * -32603 from its own faults, and -32600 from its own batch size limit.
 */
async function request(
  post: (body: string) => Promise<Response>,
  calls: { method: string; params: unknown[] }[],
): Promise<unknown[]> {
  const response = await post(
    JSON.stringify(calls.map(({ method, params }, id) => ({ jsonrpc: "2.0", id, method, params }))),
  )
  if (!response.ok) {
    throw new RpcEndpointError(
      `Error reading the Aztec registry: ${response.status} ${response.statusText}`,
    )
  }

  const replies = (await response.json().catch(() => undefined)) as
    { id: number; result?: unknown; error?: { message: string } }[] | undefined
  if (!Array.isArray(replies)) {
    throw new RpcEndpointError(
      "Error reading the Aztec registry: the node did not answer the batch",
    )
  }
  return calls.map(({ method }, id) => {
    const reply = replies.find((r) => r.id === id)
    if (!reply || reply.error) {
      throw new RpcEndpointError(
        `Error from the Aztec node: ${reply?.error?.message ?? `no reply to ${method}`}`,
      )
    }
    return reply.result
  })
}

/** ZKPassportRegistry's storage slots, from its compiled storage layout */
const PAUSED_SLOT = 3n
const CONFIG_SLOT = 7n
const LATEST_SLOT = 8n
const ROOTS_SLOT = 9n

/** Packed lengths of RegistryConfig (mode, window), LatestRootPair (latest, previous) and RootStatus */
const REGISTRY_CONFIG_LENGTH = 2
const LATEST_ROOT_PAIR_LENGTH = 2
const ROOT_STATUS_LENGTH = 4

/** Aztec's PUBLIC_STORAGE_MAP_SLOT domain separator, from @aztec-labs/constants */
const PUBLIC_STORAGE_MAP_SLOT_SEPARATOR = 4015149901n

/** ZKPassportRegistry's root validation modes */
const MODE_LATEST_ONLY = 0n
const MODE_LATEST_AND_PREVIOUS = 1n
const MODE_VALID_AT_TIMESTAMP = 2n
const MODE_VALID_WITHIN_WINDOW = 3n

/** The storage slot of `map[key]` for the map at `slot`: Poseidon2 of the separator, `slot` and `key` */
function mapSlot(slot: bigint, key: bigint): Promise<bigint> {
  return poseidon2HashAsync([PUBLIC_STORAGE_MAP_SLOT_SEPARATOR, slot, key])
}

function readBlockTimestamp(block: unknown, blockNumber: unknown): string {
  const timestamp = (block as { header?: { globalVariables?: { timestamp?: unknown } } } | null)
    ?.header?.globalVariables?.timestamp
  if (timestamp === undefined) {
    throw new RpcEndpointError(
      `Error reading the Aztec registry: the node returned no block ${blockNumber}`,
    )
  }
  return String(timestamp)
}

/** ZKPassportRegistry's is_root_valid */
function isRootValidInMode(
  mode: bigint,
  window: bigint,
  latestPair: { latest: bigint; previous: bigint },
  status: { exists: boolean; revoked: boolean; validFrom: bigint; validTo: bigint },
  root: bigint,
  timestamp: bigint,
): boolean {
  if (!status.exists || status.revoked) {
    return false
  }

  const isLatest = latestPair.latest === root
  const notExpiredAt = (time: bigint) => status.validTo === 0n || status.validTo >= time
  switch (mode) {
    case MODE_LATEST_ONLY:
      return isLatest
    case MODE_LATEST_AND_PREVIOUS:
      return isLatest || latestPair.previous === root
    case MODE_VALID_AT_TIMESTAMP:
      return timestamp >= status.validFrom && notExpiredAt(timestamp)
    case MODE_VALID_WITHIN_WINDOW:
      if (isLatest) {
        return true
      }
      if (timestamp < window) {
        return false
      }
      return status.validFrom <= timestamp && notExpiredAt(timestamp - window)
    default:
      return false
  }
}
