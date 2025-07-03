import { computeMerkleProof } from "."

describe("merkle tree", () => {
  test("compute merkle proof", async () => {
    const leaves = [BigInt(1)]
    const index = 0
    const height = 14
    const proof = await computeMerkleProof(leaves, index, height)
    expect(proof.index).toEqual(0)
    expect(proof.path).toEqual([
      "0x00",
      "0x0b63a53787021a4a962a452c2921b3663aff1ffd8d5510540f8e659e782956f1",
      "0x0e34ac2c09f45a503d2908bcb12f1cbae5fa4065759c88d501c097506a8b2290",
      "0x21f9172d72fdcdafc312eee05cf5092980dda821da5b760a9fb8dbdf607c8a20",
      "0x2373ea368857ec7af97e7b470d705848e2bf93ed7bef142a490f2119bcf82d8e",
      "0x120157cfaaa49ce3da30f8b47879114977c24b266d58b0ac18b325d878aafddf",
      "0x01c28fe1059ae0237b72334700697bdf465e03df03986fe05200cadeda66bd76",
      "0x2d78ed82f93b61ba718b17c2dfe5b52375b4d37cbbed6f1fc98b47614b0cf21b",
      "0x067243231eddf4222f3911defbba7705aff06ed45960b27f6f91319196ef97e1",
      "0x1849b85f3c693693e732dfc4577217acc18295193bede09ce8b97ad910310972",
      "0x2a775ea761d20435b31fa2c33ff07663e24542ffb9e7b293dfce3042eb104686",
      "0x0f320b0703439a8114f81593de99cd0b8f3b9bf854601abb5b2ea0e8a3dda4a7",
      "0x0d07f6e7a8a0e9199d6d92801fff867002ff5b4808962f9da2ba5ce1bdd26a73",
      "0x1c4954081e324939350febc2b918a293ebcdaead01be95ec02fcbe8d2c1635d1",
    ])
    expect(proof.root).toEqual("0x2a9ad141437856f3f43031151bf1b11938c541cfdb67c06639fa4a047eadc706")
  })
})
