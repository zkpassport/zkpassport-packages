import { getDiscloseParameterCommitment } from "./disclose"
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
      17383518782000629355431899258197281410942500696842135446165121988567400919786n,
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
      63633384777712081687217140413633142258647169827991817671047913477052352468n,
    )
  })

  test("Disclose", async () => {
    const sampleDG1 =
      "P<AUSSILVERHAND<<JOHNNY<<<<<<<<<<<<<<<<<<<<<PA1234567_AUS881112_M300101_<CYBERCITY<<<<<<\0\0"
    const discloseMask = Array.from({ length: 90 }, () => 1)
    const result = await getDiscloseParameterCommitment(
      discloseMask,
      sampleDG1.split("").map((x) => x.charCodeAt(0)),
    )
    expect(result).toEqual(
      BigInt("0x10e0ee79b56de1ef2bad643678d973fe883d9d022be50e6f0627b57a66241e16"),
    )
  })
})
