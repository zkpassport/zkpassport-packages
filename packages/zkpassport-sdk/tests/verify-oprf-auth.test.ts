import { describe, expect, test } from "bun:test"
import { ZKPassport } from "../src/index"
import type { ProofResult } from "@zkpassport/utils"

const proofNamed = (name: string): ProofResult => ({ name })

const authBundle = [
  proofNamed("sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256"),
  proofNamed("sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256"),
  proofNamed("data_check_integrity_sa_sha256_dg_sha256"),
  proofNamed("facematch_ios"),
  proofNamed("oprf_auth"),
]

// A disclosure proof must never reach the path that skips the domain and scope check
describe("verifyOprfAuth() bundle guard", () => {
  test("rejects a bundle containing a disclosure proof", async () => {
    await expect(
      ZKPassport.verifyOprfAuth({ proofs: [...authBundle, proofNamed("compare_age")] }),
    ).rejects.toThrow("compare_age")
  })

  test("rejects a bundle missing its facematch or oprf_auth proof", async () => {
    for (const missing of ["facematch", "oprf_auth"]) {
      const proofs = authBundle.filter((proof) => !proof.name?.startsWith(missing))
      await expect(ZKPassport.verifyOprfAuth({ proofs })).rejects.toThrow(
        "requires a facematch and an oprf_auth proof",
      )
    }
  })
})
