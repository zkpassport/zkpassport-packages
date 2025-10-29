import { Binary, hashSaltDg1Dg2HashPrivateNullifier } from ".."

describe("Commitments", () => {
  test("commitment out of integrity proof", async () => {
    const salts = {
      dg1Salt: 1n,
      expiryDateSalt: 2n,
      dg2HashSalt: 3n,
      privateNullifierSalt: 4n,
    }
    const dg1 = Binary.from(Array.from({ length: 95 }, () => 1))
    const expiryDate = "000000"
    const dg2Hash = 2n
    const dg2HashType = 3
    const privateNullifier = 4n
    const commitment = await hashSaltDg1Dg2HashPrivateNullifier(
      salts,
      dg1,
      expiryDate,
      dg2Hash,
      dg2HashType,
      privateNullifier,
    )
    expect(commitment.toHex()).toEqual(
      "0x11c79137d08731a5ecf2fa2bd73797a39ff93b0dfcd90c4e93dfd0e27eab73f6",
    )
  })
})
