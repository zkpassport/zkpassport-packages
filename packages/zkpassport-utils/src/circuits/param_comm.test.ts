import { getFacematchEvmParameterCommitment, getFacematchParameterCommitment } from "./facematch"

describe("Parameter Commitments", () => {
  test("Facematch", async () => {
    const root_key_leaf = 0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn
    const environment = 0n
    const app_id_hash = 0x067041deed02d9d2df216a420b50404bdf5bcb0026db2602a4142e380a9d6e2an
    const facematch_mode = 1n
    const result = await getFacematchParameterCommitment(
      root_key_leaf,
      environment,
      app_id_hash,
      facematch_mode,
    )
    expect(result).toEqual(
      10298803426319310768182807265163320556303426727429437892477857285727004346183n,
    )
  })

  test("Facematch EVM", async () => {
    const root_key_leaf = 0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn
    const environment = 0n
    const app_id_hash = 0x067041deed02d9d2df216a420b50404bdf5bcb0026db2602a4142e380a9d6e2an
    const facematch_mode = 1n
    const result = await getFacematchEvmParameterCommitment(
      root_key_leaf,
      environment,
      app_id_hash,
      facematch_mode,
    )
    expect(result).toEqual(
      411684407349475007878609901952883275022145949767199034031846054800986269145n,
    )
  })
})
