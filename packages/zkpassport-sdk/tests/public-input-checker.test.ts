import { PublicInputChecker } from "../src/public-input-checker"
import type {
  Query,
  QueryResult,
  ProofResult,
  DiscloseCommittedInputs,
  SanctionsBuilder,
} from "@zkpassport/utils"

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
      // gt check stores error under gte key
      expect(hasOriginalQueryError(queryResultErrors.age, "gte")).toBe(true)
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
      // gt error stored under gte key
      expect(hasOriginalQueryError(queryResultErrors.birthdate, "gte")).toBe(true)
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
      // gt error stored under gte key
      expect(hasOriginalQueryError(queryResultErrors.expiry_date, "gte")).toBe(true)
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
