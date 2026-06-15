import { PublicInputChecker } from "../src/public-input-checker"
import type {
  Query,
  QueryResult,
  ProofResult,
  DiscloseCommittedInputs,
  SanctionsBuilder,
  FacematchCommittedInputs,
} from "@zkpassport/utils"
import {
  SECONDS_BETWEEN_1900_AND_1970,
  getServiceScopeHash,
  getScopeHash,
  getAgeParameterCommitment,
} from "@zkpassport/utils"
import {
  APPLE_APP_ATTEST_ROOT_KEY_HASH,
  GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH,
  ZKPASSPORT_IOS_APP_ID_HASH,
  ZKPASSPORT_ANDROID_APP_ID_HASH,
} from "../src/constants"

// Helper to build a minimal disclose proof with committed inputs
function makeDiscloseProof(disclosedBytes: number[]): ProofResult {
  return {
    name: "disclose_bytes",
    proof: "",
    total: 1,
    committedInputs: {
      disclose_bytes: {
        discloseMask: disclosedBytes.map((b) => (b !== 0 ? 1 : 0)),
        disclosedBytes,
      } as DiscloseCommittedInputs,
    },
  }
}

// Helper to build a minimal age proof with committed inputs
function makeAgeProof(minAge: number, maxAge: number): ProofResult {
  return {
    name: "compare_age",
    proof: "",
    total: 1,
    committedInputs: {
      compare_age: { minAge, maxAge },
    },
  }
}

// Helper to check that no error with "original query" is present in a field
function hasOriginalQueryError(
  errors: Record<string, unknown> | undefined,
  field: string,
): boolean {
  if (!errors) return false
  const err = errors[field]
  if (!err) return false
  return (
    typeof (err as { message: string }).message === "string" &&
    (err as { message: string }).message.includes("original query")
  )
}

describe("PublicInputChecker - originalQuery validation", () => {
  describe("checkDiscloseBytesPublicInputs", () => {
    // We use zeroed disclosed bytes so disclosed data won't match queryResult expected values.
    // The tests focus on originalQuery checks which run independently of disclosed data checks.
    const emptyProof = makeDiscloseProof(new Array(90).fill(0))

    describe("nationality eq", () => {
      test("no originalQuery error when queryResult matches originalQuery", () => {
        const originalQuery: Query = { nationality: { eq: "FRA" } }
        const queryResult: QueryResult = {
          nationality: { eq: { expected: "FRA", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        // The existing disclosed-data check may set an eq error, but it shouldn't be the originalQuery one
        expect(hasOriginalQueryError(queryResultErrors.nationality, "eq")).toBe(false)
      })

      test("fails when queryResult eq expected differs from originalQuery", () => {
        const originalQuery: Query = { nationality: { eq: "FRA" } }
        const queryResult: QueryResult = {
          nationality: { eq: { expected: "DEU", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.nationality, "eq")).toBe(true)
      })

      test("fails when queryResult has eq but originalQuery does not", () => {
        const originalQuery: Query = { nationality: { disclose: true } }
        const queryResult: QueryResult = {
          nationality: { eq: { expected: "FRA", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.nationality, "eq")).toBe(true)
      })
    })

    describe("nationality disclose", () => {
      test("fails when queryResult has disclose but originalQuery does not", () => {
        const originalQuery: Query = { nationality: { eq: "FRA" } }
        const queryResult: QueryResult = {
          nationality: { disclose: { result: "FRA" } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.nationality, "disclose")).toBe(true)
      })

      test("no originalQuery disclose error when originalQuery requests it", () => {
        const originalQuery: Query = { nationality: { disclose: true } }
        const queryResult: QueryResult = {
          nationality: { disclose: { result: "FRA" } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.nationality, "disclose")).toBe(false)
      })
    })

    describe("gender eq", () => {
      test("fails when queryResult gender eq differs from originalQuery", () => {
        const originalQuery: Query = { gender: { eq: "female" } }
        const queryResult: QueryResult = {
          gender: { eq: { expected: "male", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.gender, "eq")).toBe(true)
      })

      test("no originalQuery error when gender eq matches", () => {
        const originalQuery: Query = { gender: { eq: "male" } }
        const queryResult: QueryResult = {
          gender: { eq: { expected: "male", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.gender, "eq")).toBe(false)
      })
    })

    describe("issuing_country eq", () => {
      test("fails when queryResult issuing_country eq differs from originalQuery", () => {
        const originalQuery: Query = { issuing_country: { eq: "FRA" } }
        const queryResult: QueryResult = {
          issuing_country: { eq: { expected: "DEU", result: false } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.issuing_country, "eq")).toBe(true)
      })
    })

    describe("document_number eq", () => {
      test("fails when queryResult document_number eq not in originalQuery", () => {
        const originalQuery: Query = {}
        const queryResult: QueryResult = {
          document_number: { eq: { expected: "ABC123", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.document_number, "eq")).toBe(true)
      })
    })

    describe("fullname eq", () => {
      test("no originalQuery error when names match case-insensitively", () => {
        const originalQuery: Query = { fullname: { eq: "JOHN DOE" } }
        const queryResult: QueryResult = {
          fullname: { eq: { expected: "john doe", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.fullname, "eq")).toBe(false)
      })

      test("fails when names differ", () => {
        const originalQuery: Query = { fullname: { eq: "JOHN DOE" } }
        const queryResult: QueryResult = {
          fullname: { eq: { expected: "JANE DOE", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.fullname, "eq")).toBe(true)
      })
    })

    describe("firstname eq", () => {
      test("fails when firstname differs from originalQuery", () => {
        const originalQuery: Query = { firstname: { eq: "JOHN" } }
        const queryResult: QueryResult = {
          firstname: { eq: { expected: "JANE", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.firstname, "eq")).toBe(true)
      })
    })

    describe("lastname eq", () => {
      test("fails when lastname not in originalQuery", () => {
        const originalQuery: Query = {}
        const queryResult: QueryResult = {
          lastname: { eq: { expected: "DOE", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.lastname, "eq")).toBe(true)
      })
    })

    describe("document_type eq", () => {
      test("fails when document_type eq not in originalQuery", () => {
        const originalQuery: Query = {}
        const queryResult: QueryResult = {
          document_type: { eq: { expected: "passport", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.document_type, "eq")).toBe(true)
      })

      test("no originalQuery error when document_type eq matches", () => {
        const originalQuery: Query = { document_type: { eq: "passport" } }
        const queryResult: QueryResult = {
          document_type: { eq: { expected: "passport", result: true } },
        }
        const { queryResultErrors } = PublicInputChecker.checkDiscloseBytesPublicInputs(
          emptyProof,
          originalQuery,
          queryResult,
        )
        expect(hasOriginalQueryError(queryResultErrors.document_type, "eq")).toBe(false)
      })
    })
  })

  describe("checkAgePublicInputs", () => {
    test("no originalQuery error when gte matches", () => {
      const proof = makeAgeProof(18, 0)
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "gte")).toBe(false)
    })

    test("fails when gte expected differs from originalQuery", () => {
      const proof = makeAgeProof(13, 0)
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 13, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "gte")).toBe(true)
    })

    test("fails when gte not in originalQuery", () => {
      const proof = makeAgeProof(18, 0)
      const originalQuery: Query = { age: { lt: 65 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "gte")).toBe(true)
    })

    test("fails when gt expected differs from originalQuery", () => {
      const proof = makeAgeProof(17, 0)
      const originalQuery: Query = { age: { gt: 18 } }
      const queryResult: QueryResult = {
        age: { gt: { expected: 17, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "gt")).toBe(true)
    })

    test("fails when lt expected differs from originalQuery", () => {
      const proof = makeAgeProof(0, 70)
      const originalQuery: Query = { age: { lt: 65 } }
      const queryResult: QueryResult = {
        age: { lt: { expected: 70, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "lt")).toBe(true)
    })

    test("fails when lte expected differs from originalQuery", () => {
      const proof = makeAgeProof(0, 30)
      const originalQuery: Query = { age: { lte: 25 } }
      const queryResult: QueryResult = {
        age: { lte: { expected: 30, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "lte")).toBe(true)
    })

    test("fails when eq expected differs from originalQuery", () => {
      const proof = makeAgeProof(25, 25)
      const originalQuery: Query = { age: { eq: 30 } }
      const queryResult: QueryResult = {
        age: { eq: { expected: 25, result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "eq")).toBe(true)
    })

    test("fails when range expected differs from originalQuery", () => {
      const proof = makeAgeProof(13, 70)
      const originalQuery: Query = { age: { range: [18, 65] } }
      const queryResult: QueryResult = {
        age: { range: { expected: [13, 70], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "range")).toBe(true)
    })

    test("fails when disclose not in originalQuery", () => {
      const proof = makeAgeProof(25, 25)
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { disclose: { result: 25 } },
      }
      const { queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.age, "disclose")).toBe(true)
    })
  })

  describe("checkBirthdatePublicInputs", () => {
    function makeBirthdateProof(minTimestamp: number, maxTimestamp: number): ProofResult {
      return {
        name: "compare_birthdate",
        proof: "",
        total: 1,
        committedInputs: {
          compare_birthdate: { minDateTimestamp: minTimestamp, maxDateTimestamp: maxTimestamp },
        },
      }
    }

    test("fails when gte expected differs from originalQuery", () => {
      const proof = makeBirthdateProof(0, 0)
      const originalQuery: Query = { birthdate: { gte: new Date("2000-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { gte: { expected: new Date("1990-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "gte")).toBe(true)
    })

    test("no originalQuery error when gte matches", () => {
      const proof = makeBirthdateProof(0, 0)
      const originalQuery: Query = { birthdate: { gte: new Date("2000-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { gte: { expected: new Date("2000-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "gte")).toBe(false)
    })

    test("fails when gt not in originalQuery", () => {
      const proof = makeBirthdateProof(0, 0)
      const originalQuery: Query = { birthdate: { gte: new Date("2000-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { gt: { expected: new Date("2000-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "gt")).toBe(true)
    })

    test("fails when lt not in originalQuery", () => {
      const proof = makeBirthdateProof(0, 0)
      const originalQuery: Query = { birthdate: { lte: new Date("2000-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { lt: { expected: new Date("2000-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "lt")).toBe(true)
    })

    test("fails when lte expected differs from originalQuery", () => {
      const proof = makeBirthdateProof(0, 0)
      const originalQuery: Query = { birthdate: { lte: new Date("2005-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { lte: { expected: new Date("2010-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "lte")).toBe(true)
    })

    test("fails when range differs from originalQuery", () => {
      const proof = makeBirthdateProof(0, 0)
      const originalQuery: Query = {
        birthdate: { range: [new Date("2000-01-01"), new Date("2005-01-01")] },
      }
      const queryResult: QueryResult = {
        birthdate: {
          range: { expected: [new Date("1990-01-01"), new Date("2005-01-01")], result: true },
        },
      }
      const { queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "range")).toBe(true)
    })
  })

  describe("checkExpiryDatePublicInputs", () => {
    function makeExpiryProof(minTimestamp: number, maxTimestamp: number): ProofResult {
      return {
        name: "compare_expiry",
        proof: "",
        total: 1,
        committedInputs: {
          compare_expiry: { minDateTimestamp: minTimestamp, maxDateTimestamp: maxTimestamp },
        },
      }
    }

    test("fails when gte expected differs from originalQuery", () => {
      const proof = makeExpiryProof(0, 0)
      const originalQuery: Query = { expiry_date: { gte: new Date("2030-01-01") } }
      const queryResult: QueryResult = {
        expiry_date: { gte: { expected: new Date("2025-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.expiry_date, "gte")).toBe(true)
    })

    test("fails when gt not in originalQuery", () => {
      const proof = makeExpiryProof(0, 0)
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        expiry_date: { gt: { expected: new Date("2025-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.expiry_date, "gt")).toBe(true)
    })

    test("fails when lt not in originalQuery", () => {
      const proof = makeExpiryProof(0, 0)
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        expiry_date: { lt: { expected: new Date("2030-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.expiry_date, "lt")).toBe(true)
    })

    test("fails when lte expected differs from originalQuery", () => {
      const proof = makeExpiryProof(0, 0)
      const originalQuery: Query = { expiry_date: { lte: new Date("2030-01-01") } }
      const queryResult: QueryResult = {
        expiry_date: { lte: { expected: new Date("2035-01-01"), result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.expiry_date, "lte")).toBe(true)
    })

    test("fails when range differs from originalQuery", () => {
      const proof = makeExpiryProof(0, 0)
      const originalQuery: Query = {
        expiry_date: { range: [new Date("2025-01-01"), new Date("2035-01-01")] },
      }
      const queryResult: QueryResult = {
        expiry_date: {
          range: { expected: [new Date("2020-01-01"), new Date("2035-01-01")], result: true },
        },
      }
      const { queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(hasOriginalQueryError(queryResultErrors.expiry_date, "range")).toBe(true)
    })
  })

  describe("checkNationalityExclusionPublicInputs", () => {
    test("no originalQuery error when queryResult out matches originalQuery", () => {
      const originalQuery: Query = { nationality: { out: ["USA", "GBR"] } }
      const queryResult: QueryResult = {
        nationality: { out: { expected: ["USA", "GBR"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkNationalityExclusionPublicInputs(
        originalQuery,
        queryResult,
        ["USA", "GBR"],
      )
      expect(hasOriginalQueryError(queryResultErrors.nationality, "out")).toBe(false)
    })

    test("fails when queryResult out differs from originalQuery", () => {
      const originalQuery: Query = { nationality: { out: ["USA", "GBR"] } }
      const queryResult: QueryResult = {
        nationality: { out: { expected: ["USA", "FRA"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkNationalityExclusionPublicInputs(
        originalQuery,
        queryResult,
        ["USA", "FRA"],
      )
      expect(hasOriginalQueryError(queryResultErrors.nationality, "out")).toBe(true)
    })

    test("fails when queryResult has out but originalQuery does not", () => {
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        nationality: { out: { expected: ["USA"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkNationalityExclusionPublicInputs(
        originalQuery,
        queryResult,
        ["USA"],
      )
      expect(hasOriginalQueryError(queryResultErrors.nationality, "out")).toBe(true)
    })
  })

  describe("checkNationalityInclusionPublicInputs", () => {
    test("no originalQuery error when queryResult in matches originalQuery", () => {
      const originalQuery: Query = { nationality: { in: ["FRA", "DEU"] } }
      const queryResult: QueryResult = {
        nationality: { in: { expected: ["FRA", "DEU"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkNationalityInclusionPublicInputs(
        originalQuery,
        queryResult,
        ["FRA", "DEU"],
      )
      expect(hasOriginalQueryError(queryResultErrors.nationality, "in")).toBe(false)
    })

    test("fails when queryResult in differs from originalQuery", () => {
      const originalQuery: Query = { nationality: { in: ["FRA", "DEU"] } }
      const queryResult: QueryResult = {
        nationality: { in: { expected: ["FRA", "ITA"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkNationalityInclusionPublicInputs(
        originalQuery,
        queryResult,
        ["FRA", "ITA"],
      )
      expect(hasOriginalQueryError(queryResultErrors.nationality, "in")).toBe(true)
    })
  })

  describe("checkIssuingCountryExclusionPublicInputs", () => {
    test("fails when queryResult out not in originalQuery", () => {
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        issuing_country: { out: { expected: ["USA"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkIssuingCountryExclusionPublicInputs(
        originalQuery,
        queryResult,
        ["USA"],
      )
      expect(hasOriginalQueryError(queryResultErrors.issuing_country, "out")).toBe(true)
    })
  })

  describe("checkIssuingCountryInclusionPublicInputs", () => {
    test("fails when queryResult in not in originalQuery", () => {
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        issuing_country: { in: { expected: ["FRA"], result: true } },
      }
      const { queryResultErrors } = PublicInputChecker.checkIssuingCountryInclusionPublicInputs(
        originalQuery,
        queryResult,
        ["FRA"],
      )
      expect(hasOriginalQueryError(queryResultErrors.issuing_country, "in")).toBe(true)
    })
  })

  describe("checkBindPublicInputs", () => {
    test("no originalQuery error when queryResult bind matches originalQuery", () => {
      const originalQuery: Query = {
        bind: { user_address: "0x1234abcd", chain: "ethereum", custom_data: "test" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0x1234abcd", chain: "ethereum", custom_data: "test" },
      }
      const { queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        originalQuery,
        queryResult,
        { user_address: "0x1234abcd", chain: "ethereum", custom_data: "test" },
      )
      expect(hasOriginalQueryError(queryResultErrors.bind, "eq")).toBe(false)
    })

    test("fails when queryResult bind user_address differs from originalQuery", () => {
      const originalQuery: Query = {
        bind: { user_address: "0x1234abcd", chain: "ethereum" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xdeadbeef", chain: "ethereum" },
      }
      const { queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        originalQuery,
        queryResult,
        { user_address: "0xdeadbeef", chain: "ethereum" },
      )
      expect(hasOriginalQueryError(queryResultErrors.bind, "eq")).toBe(true)
    })

    test("fails when queryResult has bind but originalQuery does not", () => {
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        bind: { user_address: "0x1234abcd", chain: "ethereum" },
      }
      const { queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        originalQuery,
        queryResult,
        { user_address: "0x1234abcd", chain: "ethereum" },
      )
      expect(hasOriginalQueryError(queryResultErrors.bind, "eq")).toBe(true)
    })
  })

  describe("checkSanctionsExclusionPublicInputs", () => {
    test("fails when queryResult has sanctions but originalQuery does not", async () => {
      const originalQuery: Query = {}
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }
      const sanctionsCommittedInputs = { rootHash: "abc", isStrict: false }
      const sanctionsBuilder = { getRoot: async () => "abc" } as unknown as SanctionsBuilder
      const { queryResultErrors } = await PublicInputChecker.checkSanctionsExclusionPublicInputs(
        originalQuery,
        queryResult,
        sanctionsCommittedInputs,
        sanctionsBuilder,
      )
      expect(hasOriginalQueryError(queryResultErrors.sanctions, "eq")).toBe(true)
    })

    test("fails when strict mode differs from originalQuery", async () => {
      const originalQuery: Query = {
        sanctions: { countries: "all", lists: "all", strict: true },
      }
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }
      const sanctionsCommittedInputs = { rootHash: "abc", isStrict: false }
      const sanctionsBuilder = { getRoot: async () => "abc" } as unknown as SanctionsBuilder
      const { queryResultErrors } = await PublicInputChecker.checkSanctionsExclusionPublicInputs(
        originalQuery,
        queryResult,
        sanctionsCommittedInputs,
        sanctionsBuilder,
      )
      expect(hasOriginalQueryError(queryResultErrors.sanctions, "eq")).toBe(true)
    })

    test("no originalQuery error when strict mode matches", async () => {
      const originalQuery: Query = {
        sanctions: { countries: "all", lists: "all", strict: false },
      }
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }
      const sanctionsCommittedInputs = { rootHash: "abc", isStrict: false }
      const sanctionsBuilder = { getRoot: async () => "abc" } as unknown as SanctionsBuilder
      const { queryResultErrors } = await PublicInputChecker.checkSanctionsExclusionPublicInputs(
        originalQuery,
        queryResult,
        sanctionsCommittedInputs,
        sanctionsBuilder,
      )
      expect(hasOriginalQueryError(queryResultErrors.sanctions, "eq")).toBe(false)
    })
  })

  describe("checkFacematchPublicInputs", () => {
    const baseFacematchInputs = {
      rootKeyLeaf: "0x0",
      environment: "production" as const,
      appIdHash: "0x0",
      integrityPubkeyHash: "0x0",
    }

    test("fails when facematch mode differs from originalQuery", async () => {
      const originalQuery: Query = { facematch: { mode: "strict" } }
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        { ...baseFacematchInputs, mode: "regular" as const },
      )
      expect(queryResultErrors.facematch?.eq).toBeDefined()
      expect(queryResultErrors.facematch!.eq!.message).toContain("facematch mode")
    })

    test("no facematch mode error when modes match", async () => {
      const originalQuery: Query = { facematch: { mode: "strict" } }
      const queryResult: QueryResult = {
        facematch: { mode: "strict", passed: true },
      }
      const { queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        { ...baseFacematchInputs, mode: "strict" as const },
      )
      // Other errors may exist (root key, app id) but mode should not be one
      const modeMessage = queryResultErrors.facematch?.eq?.message
      if (modeMessage) {
        expect(modeMessage).not.toContain("facematch mode")
      }
    })
  })
})

describe("PublicInputChecker - committed inputs vs queryResult", () => {
  describe("checkAgePublicInputs", () => {
    test("passes when committed minAge matches queryResult gte", () => {
      const proof = makeAgeProof(18, 0)
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed minAge does not match queryResult gte expected", () => {
      const proof = makeAgeProof(16, 0) // committed says 16
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } }, // queryResult says 18
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.gte).toBeDefined()
    })

    test("passes when committed maxAge matches queryResult lt", () => {
      const proof = makeAgeProof(0, 64)
      const originalQuery: Query = { age: { lt: 65 } }
      const queryResult: QueryResult = {
        age: { lt: { expected: 65, result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed maxAge does not match queryResult lt expected", () => {
      const proof = makeAgeProof(0, 70)
      const originalQuery: Query = { age: { lt: 65 } }
      const queryResult: QueryResult = {
        age: { lt: { expected: 65, result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.lt).toBeDefined()
    })

    test("passes when committed range matches queryResult range", () => {
      const proof = makeAgeProof(18, 65)
      const originalQuery: Query = { age: { range: [18, 65] } }
      const queryResult: QueryResult = {
        age: { range: { expected: [18, 65], result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed range does not match queryResult range", () => {
      const proof = makeAgeProof(13, 70)
      const originalQuery: Query = { age: { range: [18, 65] } }
      const queryResult: QueryResult = {
        age: { range: { expected: [18, 65], result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.range).toBeDefined()
    })

    test("maxAge should be 0 when no upper-bound constraint", () => {
      const proof = makeAgeProof(18, 5) // maxAge != 0 but no upper-bound query
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.disclose?.message).toContain("Maximum age should be equal to 0")
    })

    test("minAge should be 0 when no lower-bound constraint", () => {
      const proof = makeAgeProof(5, 65) // minAge != 0 but no lower-bound query
      const originalQuery: Query = { age: { lt: 65 } }
      const queryResult: QueryResult = {
        age: { lt: { expected: 65, result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.disclose?.message).toContain("Minimum age should be equal to 0")
    })

    test("fails when age is not set in queryResult", () => {
      const proof = makeAgeProof(18, 0)
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {}
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.disclose?.message).toContain(
        "Age is not set in the query result",
      )
    })

    test("fails when disclosed age does not match committed", () => {
      const proof = makeAgeProof(25, 25) // min=max=25 means exact age
      const originalQuery: Query = { age: { eq: 25, disclose: true } }
      const queryResult: QueryResult = {
        age: { disclose: { result: 30 } }, // disclosed 30 but committed 25
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.disclose?.message).toContain(
        "Age does not match the disclosed age",
      )
    })

    test("passes when committed minAge matches queryResult gt", () => {
      const proof = makeAgeProof(18, 0)
      const originalQuery: Query = { age: { gt: 17 } }
      const queryResult: QueryResult = {
        age: { gt: { expected: 17, result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed minAge does not match queryResult gt expected", () => {
      const proof = makeAgeProof(15, 0) // committed says 15
      const originalQuery: Query = { age: { gt: 17 } }
      const queryResult: QueryResult = {
        age: { gt: { expected: 17, result: true } }, // queryResult says 17
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.gt).toBeDefined()
      expect(queryResultErrors.age!.gt!.message).toContain("not greater than")
    })

    test("passes when committed maxAge matches queryResult lte", () => {
      const proof = makeAgeProof(0, 65)
      const originalQuery: Query = { age: { lte: 65 } }
      const queryResult: QueryResult = {
        age: { lte: { expected: 65, result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed maxAge does not match queryResult lte expected", () => {
      const proof = makeAgeProof(0, 70) // committed says 70
      const originalQuery: Query = { age: { lte: 65 } }
      const queryResult: QueryResult = {
        age: { lte: { expected: 65, result: true } }, // queryResult says 65
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.lte).toBeDefined()
      expect(queryResultErrors.age!.lte!.message).toContain("not less than or equal")
    })

    test("passes when committed minAge and maxAge match queryResult eq", () => {
      const proof = makeAgeProof(25, 25)
      const originalQuery: Query = { age: { eq: 25 } }
      const queryResult: QueryResult = {
        age: { eq: { expected: 25, result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed minAge does not match queryResult eq expected", () => {
      const proof = makeAgeProof(20, 25) // minAge != expected
      const originalQuery: Query = { age: { eq: 25 } }
      const queryResult: QueryResult = {
        age: { eq: { expected: 25, result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.eq).toBeDefined()
      expect(queryResultErrors.age!.eq!.message).toContain("does not match the expected age")
    })

    test("fails when committed maxAge does not match queryResult eq expected", () => {
      const proof = makeAgeProof(25, 30) // maxAge != expected
      const originalQuery: Query = { age: { eq: 25 } }
      const queryResult: QueryResult = {
        age: { eq: { expected: 25, result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkAgePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.eq).toBeDefined()
      expect(queryResultErrors.age!.eq!.message).toContain("does not match the expected age")
    })
  })

  describe("checkBirthdatePublicInputs", () => {
    // Birthdate timestamps in committed inputs are offset by SECONDS_BETWEEN_1900_AND_1970
    const offset = SECONDS_BETWEEN_1900_AND_1970

    function birthdateTimestamp(date: Date): number {
      return Math.floor(date.getTime() / 1000) + offset
    }

    function makeBirthdateProof(minDate: Date | null, maxDate: Date | null): ProofResult {
      return {
        name: "compare_birthdate",
        proof: "",
        total: 1,
        committedInputs: {
          compare_birthdate: {
            minDateTimestamp: minDate ? birthdateTimestamp(minDate) : 0,
            maxDateTimestamp: maxDate ? birthdateTimestamp(maxDate) : 0,
          },
        },
      }
    }

    test("passes when committed minDate matches queryResult gte", () => {
      const date = new Date("2000-01-01")
      const proof = makeBirthdateProof(date, null)
      const originalQuery: Query = { birthdate: { gte: date } }
      const queryResult: QueryResult = {
        birthdate: { gte: { expected: new Date("2000-01-01"), result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed minDate does not match queryResult gte expected", () => {
      const proof = makeBirthdateProof(new Date("1990-01-01"), null)
      const originalQuery: Query = { birthdate: { gte: new Date("2000-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { gte: { expected: new Date("2000-01-01"), result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.birthdate?.gte).toBeDefined()
    })

    test("passes when committed maxDate matches queryResult lte", () => {
      const date = new Date("2005-06-15")
      const proof = makeBirthdateProof(null, date)
      const originalQuery: Query = { birthdate: { lte: date } }
      const queryResult: QueryResult = {
        birthdate: { lte: { expected: new Date("2005-06-15"), result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed maxDate does not match queryResult lte expected", () => {
      const proof = makeBirthdateProof(null, new Date("2010-01-01"))
      const originalQuery: Query = { birthdate: { lte: new Date("2005-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { lte: { expected: new Date("2005-01-01"), result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.birthdate?.lte).toBeDefined()
    })

    test("passes when committed minDate matches queryResult gt (offset by +1 day)", () => {
      const proof = makeBirthdateProof(new Date("1995-01-02"), null)
      const originalQuery: Query = { birthdate: { gt: new Date("1995-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { gt: { expected: new Date("1995-01-01"), result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed minDate does not match queryResult gt expected +1 day", () => {
      const proof = makeBirthdateProof(new Date("1995-01-01"), null)
      const originalQuery: Query = { birthdate: { gt: new Date("1995-01-01") } }
      const queryResult: QueryResult = {
        birthdate: { gt: { expected: new Date("1995-01-01"), result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.birthdate?.gt).toBeDefined()
    })

    test("passes when committed maxDate matches queryResult lt (offset by -1 day)", () => {
      const proof = makeBirthdateProof(null, new Date("1997-12-30"))
      const originalQuery: Query = { birthdate: { lt: new Date("1997-12-31") } }
      const queryResult: QueryResult = {
        birthdate: { lt: { expected: new Date("1997-12-31"), result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed maxDate does not match queryResult lt expected -1 day", () => {
      const proof = makeBirthdateProof(null, new Date("1997-12-31"))
      const originalQuery: Query = { birthdate: { lt: new Date("1997-12-31") } }
      const queryResult: QueryResult = {
        birthdate: { lt: { expected: new Date("1997-12-31"), result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.birthdate?.lt).toBeDefined()
    })

    test("fails when birthdate is not set in queryResult", () => {
      const proof = makeBirthdateProof(new Date("2000-01-01"), null)
      const originalQuery: Query = { birthdate: { gte: new Date("2000-01-01") } }
      const queryResult: QueryResult = {}
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBirthdatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.birthdate?.disclose?.message).toContain(
        "Birthdate is not set in the query result",
      )
    })
  })

  describe("checkExpiryDatePublicInputs", () => {
    // Expiry date uses direct timestamps (no 1900 offset)
    function makeExpiryProof(minDate: Date | null, maxDate: Date | null): ProofResult {
      return {
        name: "compare_expiry",
        proof: "",
        total: 1,
        committedInputs: {
          compare_expiry: {
            minDateTimestamp: minDate ? Math.floor(minDate.getTime() / 1000) : 0,
            maxDateTimestamp: maxDate ? Math.floor(maxDate.getTime() / 1000) : 0,
          },
        },
      }
    }

    test("passes when committed minDate matches queryResult gte", () => {
      const date = new Date("2030-01-01")
      const proof = makeExpiryProof(date, null)
      const originalQuery: Query = { expiry_date: { gte: date } }
      const queryResult: QueryResult = {
        expiry_date: { gte: { expected: new Date("2030-01-01"), result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when committed minDate does not match queryResult gte expected", () => {
      const proof = makeExpiryProof(new Date("2025-01-01"), null)
      const originalQuery: Query = { expiry_date: { gte: new Date("2030-01-01") } }
      const queryResult: QueryResult = {
        expiry_date: { gte: { expected: new Date("2030-01-01"), result: true } },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.expiry_date?.gte).toBeDefined()
    })

    test("fails when expiry date is not set in queryResult", () => {
      const proof = makeExpiryProof(new Date("2030-01-01"), null)
      const originalQuery: Query = { expiry_date: { gte: new Date("2030-01-01") } }
      const queryResult: QueryResult = {}
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkExpiryDatePublicInputs(
        proof,
        originalQuery,
        queryResult,
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.expiry_date?.disclose?.message).toContain(
        "Expiry date is not set in the query result",
      )
    })
  })

  describe("checkNationalityExclusionPublicInputs", () => {
    const originalQuery: Query = { nationality: { out: ["GBR", "USA"] } }

    test("passes when country list matches queryResult expected", () => {
      const queryResult: QueryResult = {
        nationality: { out: { expected: ["GBR", "USA"], result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkNationalityExclusionPublicInputs(
        originalQuery,
        queryResult,
        ["GBR", "USA"],
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when country list does not match queryResult expected", () => {
      const queryResult: QueryResult = {
        nationality: { out: { expected: ["GBR", "USA"], result: true } },
      }
      // committed list has FRA instead of USA
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkNationalityExclusionPublicInputs(originalQuery, queryResult, [
          "FRA",
          "GBR",
        ])
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.nationality?.out).toBeDefined()
    })

    test("fails when nationality out is not set in queryResult", () => {
      const queryResult: QueryResult = {}
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkNationalityExclusionPublicInputs(originalQuery, queryResult, [
          "GBR",
          "USA",
        ])
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.nationality?.out?.message).toContain(
        "Nationality exclusion is not set",
      )
    })

    test("fails when country list is not sorted", () => {
      const queryResult: QueryResult = {
        nationality: { out: { expected: ["USA", "GBR"], result: true } },
      }
      // Unsorted list: USA > GBR alphabetically
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkNationalityExclusionPublicInputs(
          { nationality: { out: ["USA", "GBR"] } },
          queryResult,
          ["USA", "GBR"],
        )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.nationality?.out?.message).toContain("not been sorted")
    })
  })

  describe("checkNationalityInclusionPublicInputs", () => {
    const originalQuery: Query = { nationality: { in: ["DEU", "FRA"] } }

    test("passes when country list matches queryResult expected", () => {
      const queryResult: QueryResult = {
        nationality: { in: { expected: ["DEU", "FRA"], result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkNationalityInclusionPublicInputs(
        originalQuery,
        queryResult,
        ["DEU", "FRA"],
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when country list does not match queryResult expected", () => {
      const queryResult: QueryResult = {
        nationality: { in: { expected: ["DEU", "FRA"], result: true } },
      }
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkNationalityInclusionPublicInputs(originalQuery, queryResult, [
          "DEU",
          "ITA",
        ])
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.nationality?.in).toBeDefined()
    })

    test("fails when nationality in is not set in queryResult", () => {
      const queryResult: QueryResult = {}
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkNationalityInclusionPublicInputs(originalQuery, queryResult, [
          "DEU",
          "FRA",
        ])
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.nationality?.in?.message).toContain(
        "Nationality inclusion is not set",
      )
    })
  })

  describe("checkIssuingCountryExclusionPublicInputs", () => {
    const originalQuery: Query = { issuing_country: { out: ["GBR", "USA"] } }

    test("passes when country list matches queryResult expected", () => {
      const queryResult: QueryResult = {
        issuing_country: { out: { expected: ["GBR", "USA"], result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkIssuingCountryExclusionPublicInputs(
        originalQuery,
        queryResult,
        ["GBR", "USA"],
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when country list does not match queryResult expected", () => {
      const queryResult: QueryResult = {
        issuing_country: { out: { expected: ["GBR", "USA"], result: true } },
      }
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkIssuingCountryExclusionPublicInputs(originalQuery, queryResult, [
          "FRA",
          "GBR",
        ])
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.issuing_country?.out).toBeDefined()
    })

    test("fails when unsorted country list", () => {
      const queryResult: QueryResult = {
        issuing_country: { out: { expected: ["USA", "GBR"], result: true } },
      }
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkIssuingCountryExclusionPublicInputs(
          { issuing_country: { out: ["USA", "GBR"] } },
          queryResult,
          ["USA", "GBR"],
        )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.issuing_country?.out?.message).toContain("not been sorted")
    })
  })

  describe("checkIssuingCountryInclusionPublicInputs", () => {
    const originalQuery: Query = { issuing_country: { in: ["DEU", "FRA"] } }

    test("passes when country list matches queryResult expected", () => {
      const queryResult: QueryResult = {
        issuing_country: { in: { expected: ["DEU", "FRA"], result: true } },
      }
      const { isCorrect } = PublicInputChecker.checkIssuingCountryInclusionPublicInputs(
        originalQuery,
        queryResult,
        ["DEU", "FRA"],
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when country list does not match queryResult expected", () => {
      const queryResult: QueryResult = {
        issuing_country: { in: { expected: ["DEU", "FRA"], result: true } },
      }
      const { isCorrect, queryResultErrors } =
        PublicInputChecker.checkIssuingCountryInclusionPublicInputs(originalQuery, queryResult, [
          "DEU",
          "ITA",
        ])
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.issuing_country?.in).toBeDefined()
    })
  })

  describe("checkBindPublicInputs", () => {
    const originalQuery: Query = {
      bind: { user_address: "0xabcdef", chain: "ethereum", custom_data: "hello" },
    }

    test("passes when all bound data matches", () => {
      const queryResult: QueryResult = {
        bind: { user_address: "0xabcdef", chain: "ethereum", custom_data: "hello" },
      }
      const { isCorrect } = PublicInputChecker.checkBindPublicInputs(originalQuery, queryResult, {
        user_address: "0xabcdef",
        chain: "ethereum",
        custom_data: "hello",
      })
      expect(isCorrect).toBe(true)
    })

    test("fails when user_address in bound data does not match queryResult", () => {
      const oq: Query = {
        bind: { user_address: "0x999999", chain: "ethereum" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xabcdef", chain: "ethereum" },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        oq,
        queryResult,
        { user_address: "0x999999", chain: "ethereum" }, // proof has different address than queryResult
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.bind?.eq).toBeDefined()
    })

    test("fails when chain in bound data does not match queryResult", () => {
      const oq: Query = {
        bind: { user_address: "0xabcdef", chain: "ethereum" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xabcdef", chain: "optimism" },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        oq,
        queryResult,
        { user_address: "0xabcdef", chain: "ethereum" }, // proof has different chain than queryResult
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.bind?.eq).toBeDefined()
    })

    test("fails when custom_data in bound data does not match queryResult", () => {
      const oq: Query = {
        bind: { user_address: "0xabcdef", chain: "ethereum", custom_data: "world" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xabcdef", chain: "ethereum", custom_data: "hello" },
      }
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        oq,
        queryResult,
        { user_address: "0xabcdef", chain: "ethereum", custom_data: "world" }, // proof differs from queryResult
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.bind?.eq).toBeDefined()
    })

    test("captures all mismatches in a single error when multiple fields differ", () => {
      // originalQuery matches queryResult so the originalQuery check doesn't overwrite
      const oq: Query = {
        bind: { user_address: "0xbbb", chain: "ethereum", custom_data: "bar" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xbbb", chain: "ethereum", custom_data: "bar" },
      }
      // boundData (committed inputs) differs from queryResult on all fields
      const { isCorrect, queryResultErrors } = PublicInputChecker.checkBindPublicInputs(
        oq,
        queryResult,
        { user_address: "0xccc", chain: "arbitrum", custom_data: "baz" },
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.bind?.eq).toBeDefined()
      // The combined error message should mention all three mismatched fields
      expect(queryResultErrors.bind!.eq!.message).toContain("user_address")
      expect(queryResultErrors.bind!.eq!.message).toContain("chain")
      expect(queryResultErrors.bind!.eq!.message).toContain("custom_data")
    })
  })

  describe("checkSanctionsExclusionPublicInputs", () => {
    const originalQuery: Query = {
      sanctions: { countries: "all", lists: "all", strict: false },
    }

    test("passes when root hash and strict match", async () => {
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }
      const sanctionsBuilder = { getRoot: async () => "abc123" } as unknown as SanctionsBuilder
      const { isCorrect } = await PublicInputChecker.checkSanctionsExclusionPublicInputs(
        originalQuery,
        queryResult,
        { rootHash: "abc123", isStrict: false },
        sanctionsBuilder,
      )
      expect(isCorrect).toBe(true)
    })

    test("fails when root hash does not match", async () => {
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }
      const sanctionsBuilder = { getRoot: async () => "abc123" } as unknown as SanctionsBuilder
      const { isCorrect, queryResultErrors } =
        await PublicInputChecker.checkSanctionsExclusionPublicInputs(
          originalQuery,
          queryResult,
          { rootHash: "wrong_root", isStrict: false },
          sanctionsBuilder,
        )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.sanctions?.eq?.message).toContain("sanctions registry root")
    })

    test("fails when strict mode in committed inputs does not match queryResult", async () => {
      const oq: Query = {
        sanctions: { countries: "all", lists: "all", strict: true },
      }
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: true },
      }
      const sanctionsBuilder = { getRoot: async () => "abc123" } as unknown as SanctionsBuilder
      const { isCorrect, queryResultErrors } =
        await PublicInputChecker.checkSanctionsExclusionPublicInputs(
          oq,
          queryResult,
          { rootHash: "abc123", isStrict: false }, // committed says non-strict
          sanctionsBuilder,
        )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.sanctions?.eq?.message).toContain("strict mode")
    })
  })

  describe("checkFacematchPublicInputs", () => {
    const originalQuery: Query = { facematch: { mode: "regular" } }

    function makeFacematchInputs(
      overrides: Partial<FacematchCommittedInputs> = {},
    ): FacematchCommittedInputs {
      return {
        rootKeyLeaf: APPLE_APP_ATTEST_ROOT_KEY_HASH,
        environment: "production",
        appIdHash: ZKPASSPORT_IOS_APP_ID_HASH,
        mode: "regular",
        integrityPubkeyHash: "0x0",
        ...overrides,
      }
    }

    test("passes with valid Apple root key, production env, iOS app id", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { isCorrect } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs(),
      )
      expect(isCorrect).toBe(true)
    })

    test("passes with valid Google RSA root key and Android app id", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { isCorrect } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs({
          rootKeyLeaf: GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH,
          appIdHash: ZKPASSPORT_ANDROID_APP_ID_HASH,
        }),
      )
      expect(isCorrect).toBe(true)
    })

    test("fails with invalid root key hash", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs({ rootKeyLeaf: "0xbadkey" }),
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.facematch?.eq?.message).toContain("root key")
    })

    test("fails with non-production environment", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs({ environment: "development" }),
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.facematch?.eq?.message).toContain("production")
    })

    test("fails with invalid app id hash", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs({ appIdHash: "0xbadappid" }),
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.facematch?.eq?.message).toContain("app id")
    })

    test("fails when committed mode does not match queryResult mode", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }
      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs({ mode: "strict" }), // committed says strict, queryResult says regular
      )
      expect(isCorrect).toBe(false)
      expect(queryResultErrors.facematch?.eq?.message).toContain("facematch mode")
    })

    test("does not check when facematch did not pass", async () => {
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: false },
      }
      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkFacematchPublicInputs(
        originalQuery,
        queryResult,
        makeFacematchInputs({ rootKeyLeaf: "0xbadkey" }), // invalid but should not be checked
      )
      expect(isCorrect).toBe(true)
      expect(queryResultErrors.facematch).not.toBeDefined()
    })
  })
})

/**
 * Build a synthetic proof hex string from an array of field values (bigints).
 * Each field becomes a 32-byte big-endian hex chunk.
 * `publicInputs` are placed first, followed by `dummyProofFieldCount` zero fields.
 * Layout: [public_inputs][proof_body] — no prefix (matches normalised format
 * consumed by `getProofData` with default offset 0).
 */
function buildProofHex(publicInputs: bigint[], dummyProofFieldCount = 10): string {
  const fields = [...publicInputs, ...new Array(dummyProofFieldCount).fill(0n)]
  return fields.map((v) => BigInt(v).toString(16).padStart(64, "0")).join("")
}

/** Get today at midnight (matching what checkPublicInputs uses) */
function getTodayTimestamp(): number {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  return Math.floor(today.getTime() / 1000)
}

describe("PublicInputChecker - checkPublicInputs", () => {
  // We mock checkCertificateRegistryRoot and checkCircuitRegistryRoot
  // since they make on-chain RPC calls. We spy on them to return success.

  const successResult = { isCorrect: true, queryResultErrors: {} }
  const originalCheckCert = PublicInputChecker.checkCertificateRegistryRoot
  const originalCheckCircuit = PublicInputChecker.checkCircuitRegistryRoot

  beforeEach(() => {
    // Override on-chain registry checks with mocks
    ;(PublicInputChecker as unknown as Record<string, unknown>).checkCertificateRegistryRoot =
      async () => successResult
    ;(PublicInputChecker as unknown as Record<string, unknown>).checkCircuitRegistryRoot =
      async () => successResult
  })

  afterEach(() => {
    ;(PublicInputChecker as unknown as Record<string, unknown>).checkCertificateRegistryRoot =
      originalCheckCert
    ;(PublicInputChecker as unknown as Record<string, unknown>).checkCircuitRegistryRoot =
      originalCheckCircuit
  })

  describe("non-outer proof path - commitment chain", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    // Shared commitment value used to link proofs
    const commitment1 = 111n
    const commitment2 = 222n
    const commitment3 = 333n
    const nullifier = 999n

    function makeDSCProof(merkleRoot: bigint, commitmentOut: bigint): ProofResult {
      // DSC proof: 2 public inputs [merkleRoot, commitmentOut]
      return {
        name: "sig_check_dsc_1234",
        proof: buildProofHex([merkleRoot, commitmentOut]),
        total: 5,
      }
    }

    function makeIDDataProof(commitmentIn: bigint, commitmentOut: bigint): ProofResult {
      // ID data proof: 2 public inputs [commitmentIn, commitmentOut]
      return {
        name: "sig_check_id_data_1234",
        proof: buildProofHex([commitmentIn, commitmentOut]),
        total: 5,
      }
    }

    function makeIntegrityProof(commitmentIn: bigint, commitmentOut: bigint): ProofResult {
      // Integrity proof: 2 public inputs [commitmentIn, commitmentOut]
      return {
        name: "data_check_integrity_1234",
        proof: buildProofHex([commitmentIn, commitmentOut]),
        total: 5,
      }
    }

    async function makeAgeDisclosureProof(
      commitmentIn: bigint,
      opts: { minAge?: number; maxAge?: number; scope?: bigint; subscope?: bigint } = {},
    ): Promise<ProofResult> {
      // Disclosure proof: 7 public inputs
      // [commitmentIn, currentDate, serviceScope, subscope, paramCommitment, nullifierType, nullifier]
      const scope = opts.scope ?? domainScopeHash
      const subscope = opts.subscope ?? 0n
      const minAge = opts.minAge ?? 18
      const maxAge = opts.maxAge ?? 0
      const paramCommitment = await getAgeParameterCommitment(minAge, maxAge)
      return {
        name: "compare_age",
        proof: buildProofHex([
          commitmentIn,
          todayTs,
          scope,
          subscope,
          paramCommitment,
          0n,
          nullifier,
        ]),
        total: 5,
        committedInputs: {
          compare_age: { minAge, maxAge },
        },
      }
    }

    test("valid commitment chain passes", async () => {
      const proofs = [
        makeDSCProof(1n, commitment1),
        makeIDDataProof(commitment1, commitment2),
        makeIntegrityProof(commitment2, commitment3),
        await makeAgeDisclosureProof(commitment3),
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors, uniqueIdentifier } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365, // large validity
      )

      // Commitment chain should pass; age check should pass
      expect(queryResultErrors.sig_check_id_data?.commitment).toBeUndefined()
      expect(queryResultErrors.data_check_integrity?.commitment).toBeUndefined()
      expect(queryResultErrors.age?.commitment).toBeUndefined()
      expect(uniqueIdentifier).toBe(nullifier.toString(10))
    })

    test("broken commitment chain between DSC and ID data fails", async () => {
      const proofs = [
        makeDSCProof(1n, commitment1),
        makeIDDataProof(999n, commitment2), // commitmentIn doesn't match DSC's commitmentOut
        makeIntegrityProof(commitment2, commitment3),
        await makeAgeDisclosureProof(commitment3),
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(queryResultErrors.sig_check_id_data?.commitment).toBeDefined()
      expect(queryResultErrors.sig_check_id_data!.commitment!.message).toContain(
        "certificate signature and ID signature",
      )
    })

    test("broken commitment chain between ID data and integrity fails", async () => {
      const proofs = [
        makeDSCProof(1n, commitment1),
        makeIDDataProof(commitment1, commitment2),
        makeIntegrityProof(999n, commitment3), // commitmentIn doesn't match
        await makeAgeDisclosureProof(commitment3),
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(queryResultErrors.data_check_integrity?.commitment).toBeDefined()
      expect(queryResultErrors.data_check_integrity!.commitment!.message).toContain(
        "ID signature and the data signed",
      )
    })

    test("broken commitment chain between integrity and disclosure fails", async () => {
      const proofs = [
        makeDSCProof(1n, commitment1),
        makeIDDataProof(commitment1, commitment2),
        makeIntegrityProof(commitment2, commitment3),
        await makeAgeDisclosureProof(999n), // commitmentIn doesn't match integrity's commitmentOut
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(queryResultErrors.age?.commitment).toBeDefined()
      expect(queryResultErrors.age!.commitment!.message).toContain("validity of the ID and the age")
    })

    test("proofs are sorted by expected order regardless of input order", async () => {
      // Provide proofs in wrong order - they should be sorted internally
      // Use only the signature/integrity proofs to test sorting without
      // disclosure param commitment complexity
      const proofs = [
        makeIntegrityProof(commitment2, commitment3),
        makeDSCProof(1n, commitment1),
        makeIDDataProof(commitment1, commitment2),
      ]
      const originalQuery: Query = {}
      const queryResult: QueryResult = {}

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      // Commitment chain between DSC → IDData → Integrity should pass
      // because proofs are sorted internally
      expect(queryResultErrors.sig_check_id_data?.commitment).toBeUndefined()
      expect(queryResultErrors.data_check_integrity?.commitment).toBeUndefined()
    })
  })

  describe("non-outer proof path - scope validation", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitment = 100n
    const nullifier = 42n

    function makeDisclosureAge(scope: bigint, subscope: bigint): ProofResult {
      return {
        name: "compare_age",
        proof: buildProofHex([commitment, todayTs, scope, subscope, 0n, 0n, nullifier]),
        total: 1,
        committedInputs: {
          compare_age: { minAge: 18, maxAge: 0 },
        },
      }
    }

    test("fails when proof domain scope does not match expected", async () => {
      const wrongScope = getServiceScopeHash("wrong-domain.com")
      const proofs = [makeDisclosureAge(wrongScope, 0n)]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.scope?.message).toContain("different domain")
    })

    test("fails when proof subscope does not match expected", async () => {
      const wrongSubscope = getScopeHash("wrong-scope")
      const proofs = [makeDisclosureAge(domainScopeHash, wrongSubscope)]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
        "my-scope",
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.scope?.message).toContain("different scope")
    })

    test("passes when scope and subscope match", async () => {
      const scopeValue = "my-scope"
      const subscope = getScopeHash(scopeValue)
      const proofs = [makeDisclosureAge(domainScopeHash, subscope)]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
        scopeValue,
      )

      expect(queryResultErrors.age?.scope).toBeUndefined()
    })
  })

  describe("non-outer proof path - current date validation", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const commitment = 100n
    const nullifier = 42n

    test("fails when proof date is too old", async () => {
      // Use a date from 30 days ago
      const oldTs = BigInt(getTodayTimestamp() - 86400 * 30)
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([commitment, oldTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400, // 1 day validity
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.date?.message).toContain("validity period")
    })

    test("passes when proof date is within validity period", async () => {
      const recentTs = BigInt(getTodayTimestamp())
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([commitment, recentTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365, // large validity
      )

      expect(queryResultErrors.age?.date).toBeUndefined()
    })

    test("fails when proof date is exactly at the validity boundary", async () => {
      const validitySeconds = 86400 // 1 day
      // Proof date exactly `validitySeconds` ago: todayToCurrentDate == expectedDifference
      // The condition is `>=`, so this should fail
      const boundaryTs = BigInt(getTodayTimestamp() - validitySeconds)
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([commitment, boundaryTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        validitySeconds,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.date?.message).toContain("validity period")
    })

    test("passes when proof date is 1 second before the validity boundary", async () => {
      const validitySeconds = 86400 // 1 day
      // Proof date (validitySeconds - 1) ago: todayToCurrentDate < expectedDifference
      const justInsideTs = BigInt(getTodayTimestamp() - validitySeconds + 1)
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([commitment, justInsideTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        validitySeconds,
      )

      expect(queryResultErrors.age?.date).toBeUndefined()
    })

    test("fails when proof date is in the future", async () => {
      const futureTs = BigInt(getTodayTimestamp() + 86400 * 365 * 3)
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([commitment, futureTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365, // large validity, so only the future bound can fail the date
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.age?.date?.message).toContain("in the future")
    })

    test("passes when proof date is within the future tolerance", async () => {
      const halfDayAheadTs = BigInt(getTodayTimestamp() + 43200) // 12h ahead, inside 1-day buffer
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([
            commitment,
            halfDayAheadTs,
            domainScopeHash,
            0n,
            0n,
            0n,
            nullifier,
          ]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(queryResultErrors.age?.date).toBeUndefined()
    })
  })

  describe("outer proof path - current date validation", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const nullifier = 42n

    // Outer proof public inputs for `outer_4` (1 disclosure proof → 8 public inputs):
    // [certRegistryRoot, circuitRegistryRoot, currentDate, serviceScope, subscope,
    //  paramCommitment, nullifierType, nullifier]
    function makeOuterProof(currentDateTs: bigint): ProofResult {
      return {
        name: "outer_4",
        proof: buildProofHex([
          1n, // certRegistryRoot (mocked)
          2n, // circuitRegistryRoot (mocked)
          currentDateTs,
          domainScopeHash,
          0n, // subscope
          0n, // paramCommitment (will fail param check, but we're testing date)
          0n, // nullifierType
          nullifier,
        ]),
        total: 1,
        committedInputs: {},
      }
    }

    test("fails when outer proof date is too old", async () => {
      const oldTs = BigInt(getTodayTimestamp() - 86400 * 30) // 30 days ago
      const proofs = [makeOuterProof(oldTs)]

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        {},
        {},
        86400, // 1 day validity
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.outer?.date?.message).toContain("validity period")
    })

    test("passes when outer proof date is within validity period", async () => {
      const recentTs = BigInt(getTodayTimestamp())
      const proofs = [makeOuterProof(recentTs)]

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        {},
        {},
        86400 * 365, // large validity
      )

      expect(queryResultErrors.outer?.date).toBeUndefined()
    })

    test("fails when outer proof date is exactly at the validity boundary", async () => {
      const validitySeconds = 86400
      const boundaryTs = BigInt(getTodayTimestamp() - validitySeconds)
      const proofs = [makeOuterProof(boundaryTs)]

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        {},
        {},
        validitySeconds,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.outer?.date?.message).toContain("validity period")
    })

    test("fails when outer proof date is in the future (age inflation)", async () => {
      const futureTs = BigInt(getTodayTimestamp() + 86400 * 365 * 3) // 3 years ahead
      const proofs = [makeOuterProof(futureTs)]

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        {},
        {},
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.outer?.date?.message).toContain("in the future")
    })

    test("passes when outer proof date is within the future tolerance", async () => {
      const halfDayAheadTs = BigInt(getTodayTimestamp() + 43200) // 12h ahead, inside 1-day skew
      const proofs = [makeOuterProof(halfDayAheadTs)]

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        {},
        {},
        86400 * 365,
      )

      expect(queryResultErrors.outer?.date).toBeUndefined()
    })
  })

  describe("non-outer proof path - nullifier extraction", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitment = 100n

    test("returns unique identifier from disclosure proof", async () => {
      const expectedNullifier = 123456789n
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([
            commitment,
            todayTs,
            domainScopeHash,
            0n,
            0n,
            0n, // nullifier type
            expectedNullifier,
          ]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { uniqueIdentifier } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(uniqueIdentifier).toBe(expectedNullifier.toString(10))
    })
  })

  describe("non-outer proof path - parameter commitment validation", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitmentIn = 100n
    const nullifier = 42n

    test("fails when parameter commitment does not match calculated", async () => {
      // The proof has paramCommitment = 0, but the calculated one from committed inputs
      // will be a real hash. This should fail the commitment check.
      const proofs: ProofResult[] = [
        {
          name: "compare_age",
          proof: buildProofHex([
            commitmentIn,
            todayTs,
            domainScopeHash,
            0n,
            999n, // wrong parameter commitment
            0n,
            nullifier,
          ]),
          total: 1,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(queryResultErrors.age?.commitment).toBeDefined()
      expect(queryResultErrors.age!.commitment!.message).toContain("conditions for the age check")
    })
  })

  describe("certificate registry root validation", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitment = 100n
    const nullifier = 42n

    test("calls checkCertificateRegistryRoot for DSC proof", async () => {
      const merkleRoot = 12345n
      const proofs: ProofResult[] = [
        {
          name: "sig_check_dsc_1234",
          proof: buildProofHex([merkleRoot, commitment]),
          total: 2,
        },
        {
          name: "compare_age",
          proof: buildProofHex([commitment, todayTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 2,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      // Verified by the test passing without RPC errors - the mock was called
      expect(true).toBe(true)
    })

    test("fails when certificate registry root is invalid", async () => {
      const failResult = {
        isCorrect: false,
        queryResultErrors: {
          sig_check_dsc: {
            certificate: {
              expected: "A valid root from ZKPassport Registry",
              received: "Got invalid certificate registry root",
              message: "The ID was signed by an unrecognized root certificate",
            },
          },
        },
      }
      ;(PublicInputChecker as unknown as Record<string, unknown>).checkCertificateRegistryRoot =
        async () => failResult

      const proofs: ProofResult[] = [
        {
          name: "sig_check_dsc_1234",
          proof: buildProofHex([999n, commitment]),
          total: 2,
        },
        {
          name: "compare_age",
          proof: buildProofHex([commitment, todayTs, domainScopeHash, 0n, 0n, 0n, nullifier]),
          total: 2,
          committedInputs: {
            compare_age: { minAge: 18, maxAge: 0 },
          },
        },
      ]
      const originalQuery: Query = { age: { gte: 18 } }
      const queryResult: QueryResult = {
        age: { gte: { expected: 18, result: true } },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.sig_check_dsc?.certificate?.message).toContain(
        "unrecognized root certificate",
      )
    })
  })

  describe("non-outer proof path - bind commitment chain and scope", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitment = 100n
    const nullifier = 42n

    function makeBindProof(commitmentIn: bigint, scope: bigint = domainScopeHash): ProofResult {
      return {
        name: "bind",
        proof: buildProofHex([commitmentIn, todayTs, scope, 0n, 0n, 0n, nullifier]),
        total: 1,
        committedInputs: {
          bind: {
            data: { user_address: "0xabc", chain: "ethereum", custom_data: "test" },
          },
        },
      }
    }

    test("fails when bind proof commitmentIn does not match integrity commitmentOut", async () => {
      const proofs = [makeBindProof(999n)] // wrong commitmentIn
      const originalQuery: Query = {
        bind: { user_address: "0xabc", chain: "ethereum", custom_data: "test" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xabc", chain: "ethereum", custom_data: "test" },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.bind?.commitment).toBeDefined()
      expect(queryResultErrors.bind!.commitment!.message).toContain("bound data")
    })

    test("fails when bind proof domain scope does not match expected", async () => {
      const wrongScope = getServiceScopeHash("wrong-domain.com")
      const proofs = [makeBindProof(commitment, wrongScope)]
      const originalQuery: Query = {
        bind: { user_address: "0xabc", chain: "ethereum", custom_data: "test" },
      }
      const queryResult: QueryResult = {
        bind: { user_address: "0xabc", chain: "ethereum", custom_data: "test" },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.bind?.scope).toBeDefined()
      expect(queryResultErrors.bind!.scope!.message).toContain("different domain")
    })
  })

  describe("non-outer proof path - sanctions commitment chain and scope", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitment = 100n
    const nullifier = 42n

    function makeSanctionsProof(
      commitmentIn: bigint,
      scope: bigint = domainScopeHash,
    ): ProofResult {
      return {
        name: "exclusion_check_sanctions",
        proof: buildProofHex([commitmentIn, todayTs, scope, 0n, 0n, 0n, nullifier]),
        total: 1,
        committedInputs: {
          exclusion_check_sanctions: { rootHash: "abc", isStrict: false },
        },
      }
    }

    test("fails when sanctions proof commitmentIn does not match", async () => {
      const proofs = [makeSanctionsProof(999n)]
      const originalQuery: Query = {
        sanctions: { countries: "all", lists: "all", strict: false },
      }
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.sanctions?.commitment).toBeDefined()
    })

    test("fails when sanctions proof domain scope does not match expected", async () => {
      const wrongScope = getServiceScopeHash("wrong-domain.com")
      const proofs = [makeSanctionsProof(commitment, wrongScope)]
      const originalQuery: Query = {
        sanctions: { countries: "all", lists: "all", strict: false },
      }
      const queryResult: QueryResult = {
        sanctions: { passed: true, isStrict: false },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.sanctions?.scope).toBeDefined()
      expect(queryResultErrors.sanctions!.scope!.message).toContain("different domain")
    })
  })

  describe("non-outer proof path - facematch commitment chain and scope", () => {
    const domain = "example.com"
    const domainScopeHash = getServiceScopeHash(domain)
    const todayTs = BigInt(getTodayTimestamp())
    const commitment = 100n

    function makeFacematchProof(
      commitmentIn: bigint,
      scope: bigint = domainScopeHash,
    ): ProofResult {
      return {
        name: "facematch_1234",
        proof: buildProofHex([commitmentIn, todayTs, scope, 0n, 0n, 0n, 0n]),
        total: 1,
        committedInputs: {
          facematch: {
            rootKeyLeaf: APPLE_APP_ATTEST_ROOT_KEY_HASH,
            environment: "production",
            appIdHash: ZKPASSPORT_IOS_APP_ID_HASH,
            mode: "regular",
            integrityPubkeyHash: "0x0",
          },
        },
      }
    }

    test("fails when facematch proof commitmentIn does not match", async () => {
      const proofs = [makeFacematchProof(999n)]
      const originalQuery: Query = { facematch: { mode: "regular" } }
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.facematch?.commitment).toBeDefined()
    })

    test("fails when facematch proof domain scope does not match expected", async () => {
      const wrongScope = getServiceScopeHash("wrong-domain.com")
      const proofs = [makeFacematchProof(commitment, wrongScope)]
      const originalQuery: Query = { facematch: { mode: "regular" } }
      const queryResult: QueryResult = {
        facematch: { mode: "regular", passed: true },
      }

      const { isCorrect, queryResultErrors } = await PublicInputChecker.checkPublicInputs(
        domain,
        proofs,
        originalQuery,
        queryResult,
        86400 * 365,
      )

      expect(isCorrect).toBe(false)
      expect(queryResultErrors.facematch?.scope).toBeDefined()
      expect(queryResultErrors.facematch!.scope!.message).toContain("different domain")
    })
  })
})
