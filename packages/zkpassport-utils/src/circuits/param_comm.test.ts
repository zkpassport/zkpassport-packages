import { getDiscloseParameterCommitment } from "./disclose"
import {
  getAttestedIdEvmParameterCommitment,
  getAttestedIdParameterCommitment,
  getFacematchEvmParameterCommitment,
  getFacematchParameterCommitment,
} from "./facematch"

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
    expect(result).toEqual(0x015bcd8d0e46c95526dcbc480883ff76b1b20615745c7a73b6857f824b6f5d86n)
  })

  test("Attested ID, the face match parameters under their own proof type", async () => {
    const root_key_leaf = 0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn
    const app_id_hash = 0x067041deed02d9d2df216a420b50404bdf5bcb0026db2602a4142e380a9d6e2an
    // Printed by `nargo test --package facematch_lib test_attested_id_param_commitment_vectors`
    expect(await getAttestedIdParameterCommitment(root_key_leaf, 1n, app_id_hash, 2n)).toEqual(
      0xc4c725dec8af1a59797f9fd5c92c062c5ee1abae6893d6182123109dfdf42en,
    )
    expect(await getAttestedIdEvmParameterCommitment(root_key_leaf, 1n, app_id_hash, 2n)).toEqual(
      0x526cb51b43c2d31fc57e9a1279102c4493dcc3828a081273ba51e324e394c4n,
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
    expect(result).toEqual(0xb2cd74f039fa19de2360cfe9c8cdadce0ed2a466d337f1989d4017369f8ec9n)
  })

  test("Facematch with an integrity anchor and revocation root, as on Android", async () => {
    const root_key_leaf = 0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn
    const app_id_hash = 0x067041deed02d9d2df216a420b50404bdf5bcb0026db2602a4142e380a9d6e2an
    expect(
      await getFacematchParameterCommitment(root_key_leaf, 1n, app_id_hash, 2n, 0x1234n, 0x5678n),
    ).toEqual(0x27f5e34206f161fea4e5d43e053fa539a504d23175f26e414dad76954fc6c0e7n)
    expect(
      await getFacematchEvmParameterCommitment(
        root_key_leaf,
        1n,
        app_id_hash,
        2n,
        0x1234n,
        0x5678n,
      ),
    ).toEqual(0x3593305e46dda857802d6e806b5154a2d789525d697578e1c99e52f6a65d59n)
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
