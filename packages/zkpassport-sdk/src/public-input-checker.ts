import {
  type ProofResult,
  type QueryResult,
  getProofData,
  getCommitmentFromDSCProof,
  getCommitmentInFromIDDataProof,
  getCommitmentOutFromIDDataProof,
  getNullifierFromDisclosureProof,
  getCommitmentInFromIntegrityProof,
  getCommitmentOutFromIntegrityProof,
  getCommitmentInFromDisclosureProof,
  getMerkleRootFromDSCProof,
  getCurrentDateFromIntegrityProof,
  DisclosedData,
  formatName,
  getNumberOfPublicInputs,
  getParameterCommitmentFromDisclosureProof,
  getCountryParameterCommitment,
  getDiscloseParameterCommitment,
  getDateParameterCommitment,
  getCertificateRegistryRootFromOuterProof,
  getParamCommitmentsFromOuterProof,
  AgeCommittedInputs,
  DiscloseCommittedInputs,
  getCurrentDateFromCommittedInputs,
  getMinAgeFromCommittedInputs,
  getMaxAgeFromCommittedInputs,
  getAgeParameterCommitment,
  DateCommittedInputs,
  CountryCommittedInputs,
  getMinDateFromCommittedInputs,
  getMaxDateFromCommittedInputs,
  getCurrentDateFromOuterProof,
  getNullifierFromOuterProof,
  getAgeEVMParameterCommitment,
  getDateEVMParameterCommitment,
  getDiscloseEVMParameterCommitment,
  getCountryEVMParameterCommitment,
  ProofType,
  getScopeHash,
  ProofData,
  getScopeFromOuterProof,
  getSubscopeFromOuterProof,
  getServiceScopeHash,
  BoundData,
  BindCommittedInputs,
  getBindEVMParameterCommitment,
  getBindParameterCommitment,
  formatBoundData,
  getCircuitRegistryRootFromOuterProof,
  areDatesEqual,
  getBirthdateMinDateTimestamp,
  getBirthdateMaxDateTimestamp,
  SanctionsCommittedInputs,
  SanctionsBuilder,
  SECONDS_BETWEEN_1900_AND_1970,
  FacematchCommittedInputs,
  getFacematchEvmParameterCommitment,
  getFacematchParameterCommitment,
  NullifierType,
  getNullifierTypeFromOuterProof,
  getNullifierTypeFromDisclosureProof,
} from "@zkpassport/utils"
import { QueryResultErrors } from "./types"
import { RegistryClient } from "@zkpassport/registry"
import {
  APPLE_APP_ATTEST_ROOT_KEY_HASH,
  DEFAULT_DATE_VALUE,
  DEFAULT_VALIDITY,
  GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH,
  ZKPASSPORT_ANDROID_APP_ID_HASH,
  ZKPASSPORT_IOS_APP_ID_HASH,
} from "./constants"

export class PublicInputChecker {
  public static checkDiscloseBytesPublicInputs(proof: ProofResult, queryResult: QueryResult) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    // We can't be certain that the disclosed data is for a passport or an ID card
    // so we need to check both (unless the document type is revealed)
    const disclosedBytes =
      (proof.committedInputs?.disclose_bytes as DiscloseCommittedInputs).disclosedBytes ??
      (proof.committedInputs?.disclose_bytes_evm as DiscloseCommittedInputs).disclosedBytes!
    const disclosedDataPassport = DisclosedData.fromDisclosedBytes(disclosedBytes, "passport")
    const disclosedDataIDCard = DisclosedData.fromDisclosedBytes(disclosedBytes, "id_card")
    if (queryResult.document_type) {
      // Document type is always at the same index in the disclosed data
      if (
        queryResult.document_type.eq &&
        queryResult.document_type.eq.result &&
        queryResult.document_type.eq.expected !== disclosedDataPassport.documentType
      ) {
        console.warn("Document type does not match the expected document type")
        isCorrect = false
        queryResultErrors.document_type = {
          ...queryResultErrors.document_type,
          eq: {
            expected: `${queryResult.document_type.eq.expected}`,
            received: `${disclosedDataPassport.documentType ?? disclosedDataIDCard.documentType}`,
            message: "Document type does not match the expected document type",
          },
        }
      }
      if (queryResult.document_type.disclose?.result !== disclosedDataIDCard.documentType) {
        console.warn("Document type does not match the disclosed document type in query result")
        isCorrect = false
        queryResultErrors.document_type = {
          ...queryResultErrors.document_type,
          disclose: {
            expected: `${queryResult.document_type.disclose?.result}`,
            received: `${disclosedDataIDCard.documentType ?? disclosedDataPassport.documentType}`,
            message: "Document type does not match the disclosed document type in query result",
          },
        }
      }
    }
    if (queryResult.birthdate) {
      const birthdatePassport = disclosedDataPassport.dateOfBirth
      const birthdateIDCard = disclosedDataIDCard.dateOfBirth
      if (
        queryResult.birthdate.eq &&
        queryResult.birthdate.eq.result &&
        !areDatesEqual(queryResult.birthdate.eq.expected, birthdatePassport) &&
        !areDatesEqual(queryResult.birthdate.eq.expected, birthdateIDCard)
      ) {
        console.warn("Birthdate does not match the expected birthdate")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          eq: {
            expected: `${queryResult.birthdate.eq.expected.toISOString()}`,
            received: `${birthdatePassport?.toISOString() ?? birthdateIDCard?.toISOString()}`,
            message: "Birthdate does not match the expected birthdate",
          },
        }
      }
      if (
        queryResult.birthdate.disclose &&
        !areDatesEqual(queryResult.birthdate.disclose.result, birthdatePassport) &&
        !areDatesEqual(queryResult.birthdate.disclose.result, birthdateIDCard)
      ) {
        console.warn("Birthdate does not match the disclosed birthdate in query result")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          disclose: {
            expected: `${queryResult.birthdate.disclose.result.toISOString()}`,
            received: `${birthdatePassport?.toISOString() ?? birthdateIDCard?.toISOString()}`,
            message: "Birthdate does not match the disclosed birthdate in query result",
          },
        }
      }
    }
    if (queryResult.expiry_date) {
      const expiryDatePassport = disclosedDataPassport.dateOfExpiry
      const expiryDateIDCard = disclosedDataIDCard.dateOfExpiry
      if (
        queryResult.expiry_date.eq &&
        queryResult.expiry_date.eq.result &&
        !areDatesEqual(queryResult.expiry_date.eq.expected, expiryDatePassport) &&
        !areDatesEqual(queryResult.expiry_date.eq.expected, expiryDateIDCard)
      ) {
        console.warn("Expiry date does not match the expected expiry date")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          eq: {
            expected: `${queryResult.expiry_date.eq.expected.toISOString()}`,
            received: `${expiryDatePassport?.toISOString() ?? expiryDateIDCard?.toISOString()}`,
            message: "Expiry date does not match the expected expiry date",
          },
        }
      }
      if (
        queryResult.expiry_date.disclose &&
        !areDatesEqual(queryResult.expiry_date.disclose.result, expiryDatePassport) &&
        !areDatesEqual(queryResult.expiry_date.disclose.result, expiryDateIDCard)
      ) {
        console.warn("Expiry date does not match the disclosed expiry date in query result")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          disclose: {
            expected: `${queryResult.expiry_date.disclose.result.toISOString()}`,
            received: `${expiryDatePassport?.toISOString() ?? expiryDateIDCard?.toISOString()}`,
            message: "Expiry date does not match the disclosed expiry date in query result",
          },
        }
      }
    }
    if (queryResult.nationality) {
      const nationalityPassport = disclosedDataPassport.nationality
      const nationalityIDCard = disclosedDataIDCard.nationality
      if (
        queryResult.nationality.eq &&
        queryResult.nationality.eq.result &&
        queryResult.nationality.eq.expected !== nationalityPassport &&
        queryResult.nationality.eq.expected !== nationalityIDCard
      ) {
        console.warn("Nationality does not match the expected nationality")
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          eq: {
            expected: `${queryResult.nationality.eq.expected}`,
            received: `${nationalityPassport ?? nationalityIDCard}`,
            message: "Nationality does not match the expected nationality",
          },
        }
      }
      if (
        queryResult.nationality.disclose &&
        queryResult.nationality.disclose.result !== nationalityPassport &&
        queryResult.nationality.disclose.result !== nationalityIDCard
      ) {
        console.warn("Nationality does not match the disclosed nationality in query result")
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          disclose: {
            expected: `${queryResult.nationality.disclose.result}`,
            received: `${nationalityPassport ?? nationalityIDCard}`,
            message: "Nationality does not match the disclosed nationality in query result",
          },
        }
      }
    }
    if (queryResult.document_number) {
      const documentNumberPassport = disclosedDataPassport.documentNumber
      const documentNumberIDCard = disclosedDataIDCard.documentNumber
      if (
        queryResult.document_number.eq &&
        queryResult.document_number.eq.result &&
        queryResult.document_number.eq.expected !== documentNumberPassport &&
        queryResult.document_number.eq.expected !== documentNumberIDCard
      ) {
        console.warn("Document number does not match the expected document number")
        isCorrect = false
        queryResultErrors.document_number = {
          ...queryResultErrors.document_number,
          eq: {
            expected: `${queryResult.document_number.eq.expected}`,
            received: `${documentNumberPassport ?? documentNumberIDCard}`,
            message: "Document number does not match the expected document number",
          },
        }
      }
      if (
        queryResult.document_number.disclose &&
        queryResult.document_number.disclose.result !== documentNumberPassport &&
        queryResult.document_number.disclose.result !== documentNumberIDCard
      ) {
        console.warn("Document number does not match the disclosed document number in query result")
        isCorrect = false
        queryResultErrors.document_number = {
          ...queryResultErrors.document_number,
          disclose: {
            expected: `${queryResult.document_number.disclose.result}`,
            received: `${documentNumberPassport ?? documentNumberIDCard}`,
            message: "Document number does not match the disclosed document number in query result",
          },
        }
      }
    }
    if (queryResult.gender) {
      const genderPassport = disclosedDataPassport.gender
      const genderIDCard = disclosedDataIDCard.gender
      if (
        queryResult.gender.eq &&
        queryResult.gender.eq.result &&
        queryResult.gender.eq.expected !== genderPassport &&
        queryResult.gender.eq.expected !== genderIDCard
      ) {
        console.warn("Gender does not match the expected gender")
        isCorrect = false
        queryResultErrors.gender = {
          ...queryResultErrors.gender,
          eq: {
            expected: `${queryResult.gender.eq.expected}`,
            received: `${genderPassport ?? genderIDCard}`,
            message: "Gender does not match the expected gender",
          },
        }
      }
      if (
        queryResult.gender.disclose &&
        queryResult.gender.disclose.result !== genderPassport &&
        queryResult.gender.disclose.result !== genderIDCard
      ) {
        console.warn("Gender does not match the disclosed gender in query result")
        isCorrect = false
        queryResultErrors.gender = {
          ...queryResultErrors.gender,
          disclose: {
            expected: `${queryResult.gender.disclose.result}`,
            received: `${genderPassport ?? genderIDCard}`,
            message: "Gender does not match the disclosed gender in query result",
          },
        }
      }
    }
    if (queryResult.issuing_country) {
      const issuingCountryPassport = disclosedDataPassport.issuingCountry
      const issuingCountryIDCard = disclosedDataIDCard.issuingCountry
      if (
        queryResult.issuing_country.eq &&
        queryResult.issuing_country.eq.result &&
        queryResult.issuing_country.eq.expected !== issuingCountryPassport &&
        queryResult.issuing_country.eq.expected !== issuingCountryIDCard
      ) {
        console.warn("Issuing country does not match the expected issuing country")
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          eq: {
            expected: `${queryResult.issuing_country.eq.expected}`,
            received: `${issuingCountryPassport ?? issuingCountryIDCard}`,
            message: "Issuing country does not match the expected issuing country",
          },
        }
      }
      if (
        queryResult.issuing_country.disclose &&
        queryResult.issuing_country.disclose.result !== issuingCountryPassport &&
        queryResult.issuing_country.disclose.result !== issuingCountryIDCard
      ) {
        console.warn("Issuing country does not match the disclosed issuing country in query result")
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          disclose: {
            expected: `${queryResult.issuing_country.disclose.result}`,
            received: `${issuingCountryPassport ?? issuingCountryIDCard}`,
            message: "Issuing country does not match the disclosed issuing country in query result",
          },
        }
      }
    }
    if (queryResult.fullname) {
      const fullnamePassport = disclosedDataPassport.name
      const fullnameIDCard = disclosedDataIDCard.name
      if (
        queryResult.fullname.eq &&
        queryResult.fullname.eq.result &&
        formatName(queryResult.fullname.eq.expected).toLowerCase() !==
          fullnamePassport.toLowerCase() &&
        formatName(queryResult.fullname.eq.expected).toLowerCase() !== fullnameIDCard.toLowerCase()
      ) {
        console.warn("Fullname does not match the expected fullname")
        isCorrect = false
        queryResultErrors.fullname = {
          ...queryResultErrors.fullname,
          eq: {
            expected: `${queryResult.fullname.eq.expected}`,
            received: `${fullnamePassport ?? fullnameIDCard}`,
            message: "Fullname does not match the expected fullname",
          },
        }
      }
      if (
        queryResult.fullname.disclose &&
        formatName(queryResult.fullname.disclose.result).toLowerCase() !==
          fullnamePassport.toLowerCase() &&
        formatName(queryResult.fullname.disclose.result).toLowerCase() !==
          fullnameIDCard.toLowerCase()
      ) {
        console.warn("Fullname does not match the disclosed fullname in query result")
        isCorrect = false
        queryResultErrors.fullname = {
          ...queryResultErrors.fullname,
          disclose: {
            expected: `${queryResult.fullname.disclose.result}`,
            received: `${fullnamePassport ?? fullnameIDCard}`,
            message: "Fullname does not match the disclosed fullname in query result",
          },
        }
      }
    }
    if (queryResult.firstname) {
      // If fullname was not revealed, then the name could be either the first name or last name
      const firstnamePassport =
        disclosedDataPassport.firstName && disclosedDataPassport.firstName.length > 0
          ? disclosedDataPassport.firstName
          : disclosedDataPassport.name
      const firstnameIDCard =
        disclosedDataIDCard.firstName && disclosedDataIDCard.firstName.length > 0
          ? disclosedDataIDCard.firstName
          : disclosedDataIDCard.name
      if (
        queryResult.firstname.eq &&
        queryResult.firstname.eq.result &&
        formatName(queryResult.firstname.eq.expected).toLowerCase() !==
          firstnamePassport.toLowerCase() &&
        formatName(queryResult.firstname.eq.expected).toLowerCase() !==
          firstnameIDCard.toLowerCase()
      ) {
        console.warn("Firstname does not match the expected firstname")
        isCorrect = false
        queryResultErrors.firstname = {
          ...queryResultErrors.firstname,
          eq: {
            expected: `${queryResult.firstname.eq.expected}`,
            received: `${firstnamePassport ?? firstnameIDCard}`,
            message: "Firstname does not match the expected firstname",
          },
        }
      }
      if (
        queryResult.firstname.disclose &&
        formatName(queryResult.firstname.disclose.result).toLowerCase() !==
          firstnamePassport.toLowerCase() &&
        formatName(queryResult.firstname.disclose.result).toLowerCase() !==
          firstnameIDCard.toLowerCase()
      ) {
        console.warn("Firstname does not match the disclosed firstname in query result")
        isCorrect = false
        queryResultErrors.firstname = {
          ...queryResultErrors.firstname,
          disclose: {
            expected: `${queryResult.firstname.disclose.result}`,
            received: `${firstnamePassport ?? firstnameIDCard}`,
            message: "Firstname does not match the disclosed firstname in query result",
          },
        }
      }
    }
    if (queryResult.lastname) {
      // If fullname was not revealed, then the name could be either the first name or last name
      const lastnamePassport =
        disclosedDataPassport.lastName && disclosedDataPassport.lastName.length > 0
          ? disclosedDataPassport.lastName
          : disclosedDataPassport.name
      const lastnameIDCard =
        disclosedDataIDCard.lastName && disclosedDataIDCard.lastName.length > 0
          ? disclosedDataIDCard.lastName
          : disclosedDataIDCard.name
      if (
        queryResult.lastname.eq &&
        queryResult.lastname.eq.result &&
        formatName(queryResult.lastname.eq.expected).toLowerCase() !==
          lastnamePassport.toLowerCase() &&
        formatName(queryResult.lastname.eq.expected).toLowerCase() !== lastnameIDCard.toLowerCase()
      ) {
        console.warn("Lastname does not match the expected lastname")
        isCorrect = false
        queryResultErrors.lastname = {
          ...queryResultErrors.lastname,
          eq: {
            expected: `${queryResult.lastname.eq.expected}`,
            received: `${lastnamePassport ?? lastnameIDCard}`,
            message: "Lastname does not match the expected lastname",
          },
        }
      }
      if (
        queryResult.lastname.disclose &&
        formatName(queryResult.lastname.disclose.result).toLowerCase() !==
          lastnamePassport.toLowerCase() &&
        formatName(queryResult.lastname.disclose.result).toLowerCase() !==
          lastnameIDCard.toLowerCase()
      ) {
        console.warn("Lastname does not match the disclosed lastname in query result")
        isCorrect = false
        queryResultErrors.lastname = {
          ...queryResultErrors.lastname,
          disclose: {
            expected: `${queryResult.lastname.disclose.result}`,
            received: `${lastnamePassport ?? lastnameIDCard}`,
            message: "Lastname does not match the disclosed lastname in query result",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkAgePublicInputs(proof: ProofResult, queryResult: QueryResult) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    const currentTime = new Date()
    const today = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate(),
      0,
      0,
      0,
      0,
    )
    const minAge = getMinAgeFromCommittedInputs(
      (proof.committedInputs?.compare_age as AgeCommittedInputs) ??
        (proof.committedInputs?.compare_age_evm as AgeCommittedInputs),
    )
    const maxAge = getMaxAgeFromCommittedInputs(
      (proof.committedInputs?.compare_age as AgeCommittedInputs) ??
        (proof.committedInputs?.compare_age_evm as AgeCommittedInputs),
    )
    if (queryResult.age) {
      if (
        queryResult.age.gte &&
        queryResult.age.gte.result &&
        minAge !== (queryResult.age.gte.expected as number)
      ) {
        console.warn("Age is not greater than or equal to the expected age")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          gte: {
            expected: queryResult.age.gte.expected,
            received: minAge,
            message: "Age is not greater than or equal to the expected age",
          },
        }
      }
      if (
        queryResult.age.lt &&
        queryResult.age.lt.result &&
        maxAge !== (queryResult.age.lt.expected as number)
      ) {
        console.warn("Age is not less than the expected age")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          lt: {
            expected: queryResult.age.lt.expected,
            received: maxAge,
            message: "Age is not less than the expected age",
          },
        }
      }
      if (queryResult.age.range) {
        if (
          queryResult.age.range.result &&
          (minAge !== (queryResult.age.range.expected[0] as number) ||
            maxAge !== (queryResult.age.range.expected[1] as number))
        ) {
          console.warn("Age is not in the expected range")
          isCorrect = false
          queryResultErrors.age = {
            ...queryResultErrors.age,
            range: {
              expected: queryResult.age.range.expected,
              received: [minAge, maxAge],
              message: "Age is not in the expected range",
            },
          }
        }
      }
      if (
        !queryResult.age.lt &&
        !queryResult.age.lte &&
        !queryResult.age.eq &&
        !queryResult.age.range &&
        maxAge != 0
      ) {
        console.warn("Maximum age should be equal to 0")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          disclose: {
            expected: 0,
            received: maxAge,
            message: "Maximum age should be equal to 0",
          },
        }
      }
      if (
        !queryResult.age.gte &&
        !queryResult.age.gt &&
        !queryResult.age.eq &&
        !queryResult.age.range &&
        minAge != 0
      ) {
        console.warn("Minimum age should be equal to 0")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          disclose: {
            expected: 0,
            received: minAge,
            message: "Minimum age should be equal to 0",
          },
        }
      }
      if (
        queryResult.age.disclose &&
        (queryResult.age.disclose.result !== minAge || queryResult.age.disclose.result !== maxAge)
      ) {
        console.warn("Age does not match the disclosed age in query result")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          disclose: {
            expected: `${minAge}`,
            received: `${queryResult.age.disclose.result}`,
            message: "Age does not match the disclosed age in query result",
          },
        }
      }
    } else {
      console.warn("Age is not set in the query result")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        disclose: {
          message: "Age is not set in the query result",
        },
      }
    }
    const currentDate = getCurrentDateFromCommittedInputs(
      (proof.committedInputs?.compare_age as AgeCommittedInputs) ??
        (proof.committedInputs?.compare_age_evm as AgeCommittedInputs),
    )
    if (
      !areDatesEqual(currentDate, today) &&
      !areDatesEqual(currentDate, today.getTime() - 86400000)
    ) {
      console.warn("Current date in the proof is too old")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        disclose: {
          expected: `${today.toISOString()}`,
          received: `${currentDate.toISOString()}`,
          message: "Current date in the proof is too old",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkBirthdatePublicInputs(proof: ProofResult, queryResult: QueryResult) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    const currentTime = new Date()
    const today = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate(),
      0,
      0,
      0,
    )
    const minDate = getBirthdateMinDateTimestamp(
      (proof.committedInputs?.compare_birthdate as DateCommittedInputs) ??
        (proof.committedInputs?.compare_birthdate_evm as DateCommittedInputs),
      -1 * SECONDS_BETWEEN_1900_AND_1970,
    )
    const maxDate = getBirthdateMaxDateTimestamp(
      (proof.committedInputs?.compare_birthdate as DateCommittedInputs) ??
        (proof.committedInputs?.compare_birthdate_evm as DateCommittedInputs),
      -1 * SECONDS_BETWEEN_1900_AND_1970,
    )
    const currentDate = getCurrentDateFromCommittedInputs(
      (proof.committedInputs?.compare_birthdate as DateCommittedInputs) ??
        (proof.committedInputs?.compare_birthdate_evm as DateCommittedInputs),
    )
    if (queryResult.birthdate) {
      if (
        queryResult.birthdate.gte &&
        queryResult.birthdate.gte.result &&
        !areDatesEqual(minDate, queryResult.birthdate.gte.expected)
      ) {
        console.warn("Birthdate is not greater than or equal to the expected birthdate")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          gte: {
            expected: queryResult.birthdate.gte.expected,
            received: minDate,
            message: "Birthdate is not greater than or equal to the expected birthdate",
          },
        }
      }
      if (
        queryResult.birthdate.lte &&
        queryResult.birthdate.lte.result &&
        !areDatesEqual(maxDate, queryResult.birthdate.lte.expected)
      ) {
        console.warn("Birthdate is not less than the expected birthdate")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          lte: {
            expected: queryResult.birthdate.lte.expected,
            received: maxDate,
            message: "Birthdate is not less than the expected birthdate",
          },
        }
      }
      if (queryResult.birthdate.range) {
        if (
          queryResult.birthdate.range.result &&
          (!areDatesEqual(minDate, queryResult.birthdate.range.expected[0]) ||
            !areDatesEqual(maxDate, queryResult.birthdate.range.expected[1]))
        ) {
          console.warn("Birthdate is not in the expected range")
          isCorrect = false
          queryResultErrors.birthdate = {
            ...queryResultErrors.birthdate,
            range: {
              expected: queryResult.birthdate.range.expected,
              received: [minDate, maxDate],
              message: "Birthdate is not in the expected range",
            },
          }
        }
      }
      if (
        !queryResult.birthdate.lte &&
        !queryResult.birthdate.lt &&
        !queryResult.birthdate.eq &&
        !queryResult.birthdate.range &&
        !areDatesEqual(maxDate, DEFAULT_DATE_VALUE)
      ) {
        console.warn("Maximum birthdate should be equal to default date value")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          disclose: {
            expected: `${DEFAULT_DATE_VALUE.toISOString()}`,
            received: `${maxDate.toISOString()}`,
            message: "Maximum birthdate should be equal to default date value",
          },
        }
      }
      if (
        !queryResult.birthdate.gte &&
        !queryResult.birthdate.gt &&
        !queryResult.birthdate.eq &&
        !queryResult.birthdate.range &&
        !areDatesEqual(minDate, DEFAULT_DATE_VALUE)
      ) {
        console.warn("Minimum birthdate should be equal to default date value")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          disclose: {
            expected: `${DEFAULT_DATE_VALUE.toISOString()}`,
            received: `${minDate.toISOString()}`,
            message: "Minimum birthdate should be equal to default date value",
          },
        }
      }
    } else {
      console.warn("Birthdate is not set in the query result")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        disclose: {
          message: "Birthdate is not set in the query result",
        },
      }
    }
    if (
      !areDatesEqual(currentDate, today) &&
      !areDatesEqual(currentDate, today.getTime() - 86400000)
    ) {
      console.warn("Current date in the proof is too old")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        disclose: {
          expected: `${today.toISOString()}`,
          received: `${currentDate.toISOString()}`,
          message: "Current date in the proof is too old",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkExpiryDatePublicInputs(proof: ProofResult, queryResult: QueryResult) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    const currentTime = new Date()
    const today = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate(),
      0,
      0,
      0,
    )
    const minDate = getMinDateFromCommittedInputs(
      (proof.committedInputs?.compare_expiry as DateCommittedInputs) ??
        (proof.committedInputs?.compare_expiry_evm as DateCommittedInputs),
    )
    const maxDate = getMaxDateFromCommittedInputs(
      (proof.committedInputs?.compare_expiry as DateCommittedInputs) ??
        (proof.committedInputs?.compare_expiry_evm as DateCommittedInputs),
    )
    const currentDate = getCurrentDateFromCommittedInputs(
      (proof.committedInputs?.compare_expiry as DateCommittedInputs) ??
        (proof.committedInputs?.compare_expiry_evm as DateCommittedInputs),
    )
    if (queryResult.expiry_date) {
      if (
        queryResult.expiry_date.gte &&
        queryResult.expiry_date.gte.result &&
        !areDatesEqual(minDate, queryResult.expiry_date.gte.expected)
      ) {
        console.warn("Expiry date is not greater than or equal to the expected expiry date")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          gte: {
            expected: queryResult.expiry_date.gte.expected,
            received: minDate,
            message: "Expiry date is not greater than or equal to the expected expiry date",
          },
        }
      }
      if (
        queryResult.expiry_date.lte &&
        queryResult.expiry_date.lte.result &&
        !areDatesEqual(maxDate, queryResult.expiry_date.lte.expected)
      ) {
        console.warn("Expiry date is not less than the expected expiry date")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          lte: {
            expected: queryResult.expiry_date.lte.expected,
            received: maxDate,
            message: "Expiry date is not less than the expected expiry date",
          },
        }
      }
      if (queryResult.expiry_date.range) {
        if (
          queryResult.expiry_date.range.result &&
          (!areDatesEqual(minDate, queryResult.expiry_date.range.expected[0]) ||
            !areDatesEqual(maxDate, queryResult.expiry_date.range.expected[1]))
        ) {
          console.warn("Expiry date is not in the expected range")
          isCorrect = false
          queryResultErrors.expiry_date = {
            ...queryResultErrors.expiry_date,
            range: {
              expected: queryResult.expiry_date.range.expected,
              received: [minDate, maxDate],
              message: "Expiry date is not in the expected range",
            },
          }
        }
      }
      if (
        !queryResult.expiry_date.lte &&
        !queryResult.expiry_date.lt &&
        !queryResult.expiry_date.eq &&
        !queryResult.expiry_date.range &&
        !areDatesEqual(maxDate, DEFAULT_DATE_VALUE)
      ) {
        console.warn("Maximum expiry date should be equal to default date value")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          disclose: {
            expected: `${DEFAULT_DATE_VALUE.toISOString()}`,
            received: `${maxDate.toISOString()}`,
            message: "Maximum expiry date should be equal to default date value",
          },
        }
      }
      if (
        !queryResult.expiry_date.gte &&
        !queryResult.expiry_date.gt &&
        !queryResult.expiry_date.eq &&
        !queryResult.expiry_date.range &&
        !areDatesEqual(minDate, DEFAULT_DATE_VALUE)
      ) {
        console.warn("Minimum expiry date should be equal to default date value")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          disclose: {
            expected: `${DEFAULT_DATE_VALUE.toISOString()}`,
            received: `${minDate.toISOString()}`,
            message: "Minimum expiry date should be equal to default date value",
          },
        }
      }
    } else {
      console.warn("Expiry date is not set in the query result")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        disclose: {
          message: "Expiry date is not set in the query result",
        },
      }
    }
    if (
      !areDatesEqual(currentDate, today) &&
      !areDatesEqual(currentDate, today.getTime() - 86400000)
    ) {
      console.warn("Current date in the proof is too old")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        disclose: {
          expected: `${today.toISOString()}`,
          received: `${currentDate.toISOString()}`,
          message: "Current date in the proof is too old",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkNationalityExclusionPublicInputs(
    queryResult: QueryResult,
    countryList: string[],
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    if (
      queryResult.nationality &&
      queryResult.nationality.out &&
      queryResult.nationality.out.result
    ) {
      if (
        !queryResult.nationality.out.expected?.every((country) => countryList.includes(country))
      ) {
        console.warn("Nationality exclusion list does not match the one from the query results")
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          out: {
            expected: queryResult.nationality.out.expected,
            received: countryList,
            message: "Nationality exclusion list does not match the one from the query results",
          },
        }
      }
    } else if (!queryResult.nationality || !queryResult.nationality.out) {
      console.warn("Nationality exclusion is not set in the query result")
      isCorrect = false
      queryResultErrors.nationality = {
        ...queryResultErrors.nationality,
        out: {
          message: "Nationality exclusion is not set in the query result",
        },
      }
    }
    // Check the countryList is in ascending order
    // If the prover doesn't use a sorted list then the proof cannot be trusted
    // as it is requirement in the circuit for the exclusion check to work
    for (let i = 1; i < countryList.length; i++) {
      if (countryList[i] < countryList[i - 1]) {
        console.warn(
          "The nationality exclusion list has not been sorted, and thus the proof cannot be trusted",
        )
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          out: {
            message:
              "The nationality exclusion list has not been sorted, and thus the proof cannot be trusted",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkIssuingCountryExclusionPublicInputs(
    queryResult: QueryResult,
    countryList: string[],
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true

    if (
      queryResult.issuing_country &&
      queryResult.issuing_country.out &&
      queryResult.issuing_country.out.result
    ) {
      if (
        !queryResult.issuing_country.out.expected?.every((country) => countryList.includes(country))
      ) {
        console.warn("Issuing country exclusion list does not match the one from the query results")
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          out: {
            expected: queryResult.issuing_country.out.expected,
            received: countryList,
            message: "Issuing country exclusion list does not match the one from the query results",
          },
        }
      }
    } else if (!queryResult.issuing_country || !queryResult.issuing_country.out) {
      console.warn("Issuing country exclusion is not set in the query result")
      isCorrect = false
      queryResultErrors.issuing_country = {
        ...queryResultErrors.issuing_country,
        out: {
          message: "Issuing country exclusion is not set in the query result",
        },
      }
    }
    // Check the countryList is in ascending order
    // If the prover doesn't use a sorted list then the proof cannot be trusted
    // as it is requirement in the circuit for the exclusion check to work
    for (let i = 1; i < countryList.length; i++) {
      if (countryList[i] < countryList[i - 1]) {
        console.warn(
          "The issuing country exclusion list has not been sorted, and thus the proof cannot be trusted",
        )
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          out: {
            message:
              "The issuing country exclusion list has not been sorted, and thus the proof cannot be trusted",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkNationalityInclusionPublicInputs(
    queryResult: QueryResult,
    countryList: string[],
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    if (
      queryResult.nationality &&
      queryResult.nationality.in &&
      queryResult.nationality.in.result
    ) {
      if (!queryResult.nationality.in.expected?.every((country) => countryList.includes(country))) {
        console.warn("Nationality inclusion list does not match the one from the query results")
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          in: {
            expected: queryResult.nationality.in.expected,
            received: countryList,
            message: "Nationality inclusion list does not match the one from the query results",
          },
        }
      }
    } else if (!queryResult.nationality || !queryResult.nationality.in) {
      console.warn("Nationality inclusion is not set in the query result")
      isCorrect = false
      queryResultErrors.nationality = {
        ...queryResultErrors.nationality,
        in: {
          message: "Nationality inclusion is not set in the query result",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkIssuingCountryInclusionPublicInputs(
    queryResult: QueryResult,
    countryList: string[],
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true

    if (
      queryResult.issuing_country &&
      queryResult.issuing_country.in &&
      queryResult.issuing_country.in.result
    ) {
      if (
        !queryResult.issuing_country.in.expected?.every((country) => countryList.includes(country))
      ) {
        console.warn("Issuing country inclusion list does not match the one from the query results")
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          in: {
            expected: queryResult.issuing_country.in.expected,
            received: countryList,
            message: "Issuing country inclusion list does not match the one from the query results",
          },
        }
      }
    } else if (!queryResult.issuing_country || !queryResult.issuing_country.in) {
      console.warn("Issuing country inclusion is not set in the query result")
      isCorrect = false
      queryResultErrors.issuing_country = {
        ...queryResultErrors.issuing_country,
        in: {
          message: "Issuing country inclusion is not set in the query result",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkScopeFromDisclosureProof(
    domain: string,
    proofData: ProofData,
    queryResultErrors: Partial<QueryResultErrors>,
    key: string,
    scope?: string,
  ) {
    let isCorrect = true
    if (domain && getServiceScopeHash(domain) !== BigInt(proofData.publicInputs[1])) {
      console.warn("The proof comes from a different domain than the one expected")
      isCorrect = false
      if (!queryResultErrors[key as keyof QueryResultErrors]) {
        queryResultErrors[key as keyof QueryResultErrors] = {}
      }
      queryResultErrors[key as keyof QueryResultErrors]!.scope = {
        expected: `Scope: ${getServiceScopeHash(domain).toString()}`,
        received: `Scope: ${BigInt(proofData.publicInputs[1]).toString()}`,
        message: "The proof comes from a different domain than the one expected",
      }
    }
    if (scope && getScopeHash(scope) !== BigInt(proofData.publicInputs[2])) {
      console.warn("The proof uses a different scope than the one expected")
      isCorrect = false
      if (!queryResultErrors[key as keyof QueryResultErrors]) {
        queryResultErrors[key as keyof QueryResultErrors] = {}
      }
      queryResultErrors[key as keyof QueryResultErrors]!.scope = {
        expected: `Scope: ${getScopeHash(scope).toString()}`,
        received: `Scope: ${BigInt(proofData.publicInputs[2]).toString()}`,
        message: "The proof uses a different scope than the one expected",
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkCertificateRegistryRoot(
    root: string,
    queryResultErrors: any,
    outer?: boolean,
  ) {
    let isCorrect = true
    try {
      // Maintained certificate registry settled onchain
      // Here we use Ethereum Sepolia
      const registryClient = new RegistryClient({ chainId: 11155111 })
      const isValid = await registryClient.isCertificateRootValid(root)
      if (!isValid) {
        console.warn("The ID was signed by an unrecognized root certificate")
        isCorrect = false
        if (!queryResultErrors[outer ? "outer" : "sig_check_dsc"]) {
          queryResultErrors[outer ? "outer" : "sig_check_dsc"] = {}
        }
        queryResultErrors[outer ? "outer" : "sig_check_dsc"].certificate = {
          expected: `A valid root from ZKPassport Registry`,
          received: `Got invalid certificate registry root: ${root}`,
          message: "The ID was signed by an unrecognized root certificate",
        }
      }
    } catch (error) {
      console.warn(error)
      console.warn("The ID was signed by an unrecognized root certificate")
      isCorrect = false
      if (!queryResultErrors[outer ? "outer" : "sig_check_dsc"]) {
        queryResultErrors[outer ? "outer" : "sig_check_dsc"] = {}
      }
      queryResultErrors[outer ? "outer" : "sig_check_dsc"].certificate = {
        expected: `A valid root from ZKPassport Registry`,
        received: `Got invalid certificate registry root: ${root}`,
        message: "The ID was signed by an unrecognized root certificate",
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkCircuitRegistryRoot(root: string, queryResultErrors: any) {
    let isCorrect = true
    try {
      const registryClient = new RegistryClient({ chainId: 11155111 })
      const isValid = await registryClient.isCircuitRootValid(root)
      if (!isValid) {
        console.warn("The proof uses unrecognized circuits")
        isCorrect = false
        queryResultErrors.outer.circuit = {
          expected: `A valid circuit from ZKPassport Registry`,
          received: `Got invalid circuit registry root: ${root}`,
          message: "The proof uses an unrecognized circuit",
        }
      }
    } catch (error) {
      console.warn(error)
      console.warn("The proof uses unrecognized circuits")
      isCorrect = false
      queryResultErrors.outer.circuit = {
        expected: `A valid circuit from ZKPassport Registry`,
        received: `Got invalid circuit registry root: ${root}`,
        message: "The proof uses an unrecognized circuit",
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkBindPublicInputs(queryResult: QueryResult, boundData: BoundData) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true

    if (queryResult.bind) {
      if (
        queryResult.bind.user_address?.toLowerCase().replace("0x", "") !==
        boundData.user_address?.toLowerCase().replace("0x", "")
      ) {
        console.warn("Bound user address does not match the one from the query results")
        isCorrect = false
        queryResultErrors.bind = {
          ...queryResultErrors.bind,
          eq: {
            expected: queryResult.bind.user_address,
            received: boundData.user_address,
            message: "Bound user address does not match the one from the query results",
          },
        }
      }
      if (queryResult.bind.chain !== boundData.chain) {
        console.warn("Bound chain id does not match the one from the query results")
        isCorrect = false
        queryResultErrors.bind = {
          ...queryResultErrors.bind,
          eq: {
            expected: queryResult.bind.chain,
            received: boundData.chain,
            message: "Bound chain id does not match the one from the query results",
          },
        }
      }
      if (
        queryResult.bind.custom_data?.trim().toLowerCase() !==
        boundData.custom_data?.trim().toLowerCase()
      ) {
        console.warn("Bound custom data does not match the one from the query results")
        isCorrect = false
        queryResultErrors.bind = {
          ...queryResultErrors.bind,
          eq: {
            expected: queryResult.bind.custom_data,
            received: boundData.custom_data,
            message: "Bound custom data does not match the one from the query results",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkSanctionsExclusionPublicInputs(
    queryResult: QueryResult,
    root: string,
    sanctionsBuilder: SanctionsBuilder,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    if (queryResult.sanctions && queryResult.sanctions.passed) {
      // For now it's fixed until we streamline the update of the sanctions registry
      const EXPECTED_ROOT = await sanctionsBuilder.getRoot()
      if (root !== EXPECTED_ROOT) {
        console.warn("Invalid sanctions registry root")
        isCorrect = false
        queryResultErrors.sanctions = {
          ...queryResultErrors.sanctions,
          eq: {
            expected: EXPECTED_ROOT,
            received: root,
            message: "Invalid sanctions registry root",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkFacematchPublicInputs(
    queryResult: QueryResult,
    facematchCommittedInputs: FacematchCommittedInputs,
  ) {
    let isCorrect = true
    let queryResultErrors: Partial<QueryResultErrors> = {}
    if (queryResult.facematch && queryResult.facematch.passed) {
      // Check if the root key is either from Apple (iOS) or Google (Android)
      if (
        facematchCommittedInputs.rootKeyLeaf !== APPLE_APP_ATTEST_ROOT_KEY_HASH &&
        facematchCommittedInputs.rootKeyLeaf !== GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH
      ) {
        console.warn("Invalid facematch root key hash")
        isCorrect = false
        queryResultErrors.facematch = {
          ...queryResultErrors.facematch,
          eq: {
            expected: `${APPLE_APP_ATTEST_ROOT_KEY_HASH} (iOS) or ${GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH} (Android)`,
            received: facematchCommittedInputs.rootKeyLeaf,
            message: "Invalid facematch root key hash",
          },
        }
      }
      const EXPECTED_ENVIRONMENT = "production"
      console.log("facematchCommittedInputs.environment", facematchCommittedInputs.environment)
      console.log("EXPECTED_ENVIRONMENT", EXPECTED_ENVIRONMENT)
      console.log(
        "facematchCommittedInputs.environment !== EXPECTED_ENVIRONMENT",
        facematchCommittedInputs.environment !== EXPECTED_ENVIRONMENT,
      )
      if (facematchCommittedInputs.environment !== EXPECTED_ENVIRONMENT) {
        console.warn("Invalid facematch environment, it should be production")
        isCorrect = false
        queryResultErrors.facematch = {
          ...queryResultErrors.facematch,
          eq: {
            expected: EXPECTED_ENVIRONMENT,
            received: facematchCommittedInputs.environment,
            message: "Invalid facematch environment, it should be production",
          },
        }
      }
      if (
        facematchCommittedInputs.appId !== ZKPASSPORT_IOS_APP_ID_HASH &&
        facematchCommittedInputs.appId !== ZKPASSPORT_ANDROID_APP_ID_HASH
      ) {
        console.warn(
          "Invalid facematch app id hash, the attestation should be coming from the ZKPassport app",
        )
        isCorrect = false
        queryResultErrors.facematch = {
          ...queryResultErrors.facematch,
          eq: {
            expected: `${ZKPASSPORT_IOS_APP_ID_HASH} (iOS) or ${ZKPASSPORT_ANDROID_APP_ID_HASH} (Android)`,
            received: facematchCommittedInputs.appId,
            message:
              "Invalid facematch app id hash, the attestation should be coming from the ZKPassport app",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkPublicInputs(
    domain: string,
    proofs: Array<ProofResult>,
    queryResult: QueryResult,
    validity?: number,
    scope?: string,
  ) {
    let commitmentIn: bigint | undefined
    let commitmentOut: bigint | undefined
    let isCorrect = true
    let uniqueIdentifier: string | undefined
    let uniqueIdentifierType: NullifierType | undefined
    const currentTime = new Date()
    const today = new Date(
      currentTime.getFullYear(),
      currentTime.getMonth(),
      currentTime.getDate(),
      0,
      0,
      0,
      0,
    )
    let queryResultErrors: Partial<QueryResultErrors> = {}

    // Since the order is important for the commitments, we need to sort the proofs
    // by their expected order: root signature check -> ID signature check -> integrity check -> disclosure
    const sortedProofs = proofs.sort((a, b) => {
      const proofOrder = [
        "sig_check_dsc",
        "sig_check_id_data",
        "data_check_integrity",
        "disclose_bytes",
        "compare_age",
        "compare_birthdate",
        "compare_expiry",
        "exclusion_check_nationality",
        "inclusion_check_nationality",
        "exclusion_check_issuing_country",
        "inclusion_check_issuing_country",
        "bind",
        "exclusion_check_sanctions",
        "facematch",
      ]
      const getIndex = (proof: ProofResult) => {
        const name = proof.name || ""
        return proofOrder.findIndex((p) => name.startsWith(p))
      }
      return getIndex(a) - getIndex(b)
    })

    for (const proof of sortedProofs!) {
      const proofData = getProofData(proof.proof as string, getNumberOfPublicInputs(proof.name!))
      if (proof.name?.startsWith("outer")) {
        const isForEVM = proof.name?.startsWith("outer_evm")
        const certificateRegistryRoot = getCertificateRegistryRootFromOuterProof(proofData)
        const {
          isCorrect: isCorrectCertificateRegistryRoot,
          queryResultErrors: queryResultErrorsCertificateRegistryRoot,
        } = await this.checkCertificateRegistryRoot(
          certificateRegistryRoot.toString(16),
          queryResultErrors,
          true,
        )
        isCorrect = isCorrect && isCorrectCertificateRegistryRoot
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCertificateRegistryRoot,
        }

        const circuitRegistryRoot = getCircuitRegistryRootFromOuterProof(proofData)
        const {
          isCorrect: isCorrectCircuitRegistryRoot,
          queryResultErrors: queryResultErrorsCircuitRegistryRoot,
        } = await this.checkCircuitRegistryRoot(circuitRegistryRoot.toString(16), queryResultErrors)
        isCorrect = isCorrect && isCorrectCircuitRegistryRoot
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCircuitRegistryRoot,
        }

        const currentDate = getCurrentDateFromOuterProof(proofData)
        const todayToCurrentDate = today.getTime() - currentDate.getTime()
        const expectedDifference = validity ? validity * 1000 : DEFAULT_VALIDITY * 1000
        const actualDifference = today.getTime() - (today.getTime() - expectedDifference)
        if (todayToCurrentDate >= actualDifference) {
          console.warn(
            `The date used to check the validity of the ID is older than the validity period`,
          )
          isCorrect = false
          queryResultErrors.outer = {
            ...queryResultErrors.outer,
            date: {
              expected: `Difference: ${validity} seconds`,
              received: `Difference: ${Math.round(todayToCurrentDate / 1000)} seconds`,
              message:
                "The date used to check the validity of the ID is older than the validity period",
            },
          }
        }
        const paramCommitments = getParamCommitmentsFromOuterProof(proofData)
        const committedInputs = proof.committedInputs
        const keysInCommittedInputs = Object.keys(committedInputs || {})
        if (keysInCommittedInputs.length !== paramCommitments.length) {
          console.warn("The proof does not verify all the requested conditions and information")
          isCorrect = false
          queryResultErrors.outer = {
            ...queryResultErrors.outer,
            commitment: {
              expected: `Number of parameter commitments: ${paramCommitments.length}`,
              received: `Number of disclosure proofs provided: ${keysInCommittedInputs.length}`,
              message: "The proof does not verify all the requested conditions and information",
            },
          }
        }
        if (domain && getServiceScopeHash(domain) !== getScopeFromOuterProof(proofData)) {
          console.warn("The proof comes from a different domain than the one expected")
          isCorrect = false
          queryResultErrors.outer = {
            ...queryResultErrors.outer,
            scope: {
              expected: `Scope: ${getServiceScopeHash(domain).toString()}`,
              received: `Scope: ${getScopeFromOuterProof(proofData).toString()}`,
              message: "The proof comes from a different domain than the one expected",
            },
          }
        }
        if (scope && getScopeHash(scope) !== getSubscopeFromOuterProof(proofData)) {
          console.warn("The proof uses a different scope than the one expected")
          isCorrect = false
          queryResultErrors.outer = {
            ...queryResultErrors.outer,
            scope: {
              expected: `Scope: ${getScopeHash(scope).toString()}`,
              received: `Scope: ${getSubscopeFromOuterProof(proofData).toString()}`,
              message: "The proof uses a different scope than the one expected",
            },
          }
        }
        if (!!committedInputs?.compare_age || !!committedInputs?.compare_age_evm) {
          const ageCommittedInputs =
            (committedInputs?.compare_age as AgeCommittedInputs) ??
            (committedInputs?.compare_age_evm as AgeCommittedInputs)
          const ageParameterCommitment = isForEVM
            ? await getAgeEVMParameterCommitment(
                ageCommittedInputs.currentDateTimestamp,
                ageCommittedInputs.minAge,
                ageCommittedInputs.maxAge,
              )
            : await getAgeParameterCommitment(
                ageCommittedInputs.currentDateTimestamp,
                ageCommittedInputs.minAge,
                ageCommittedInputs.maxAge,
              )
          if (!paramCommitments.includes(ageParameterCommitment)) {
            console.warn("This proof does not verify the age")
            isCorrect = false
            queryResultErrors.age = {
              ...queryResultErrors.age,
              commitment: {
                expected: `Age parameter commitment: ${ageParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the age",
              },
            }
          }
          const { isCorrect: isCorrectAge, queryResultErrors: queryResultErrorsAge } =
            this.checkAgePublicInputs(proof, queryResult)
          isCorrect = isCorrect && isCorrectAge
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsAge,
          }
        }
        if (!!committedInputs?.compare_birthdate || !!committedInputs?.compare_birthdate_evm) {
          const birthdateCommittedInputs =
            (committedInputs?.compare_birthdate as DateCommittedInputs) ??
            (committedInputs?.compare_birthdate_evm as DateCommittedInputs)
          const birthdateParameterCommitment = isForEVM
            ? await getDateEVMParameterCommitment(
                ProofType.BIRTHDATE,
                birthdateCommittedInputs.currentDateTimestamp,
                birthdateCommittedInputs.minDateTimestamp,
                birthdateCommittedInputs.maxDateTimestamp,
                0,
              )
            : await getDateParameterCommitment(
                ProofType.BIRTHDATE,
                birthdateCommittedInputs.currentDateTimestamp,
                birthdateCommittedInputs.minDateTimestamp,
                birthdateCommittedInputs.maxDateTimestamp,
                0,
              )
          if (!paramCommitments.includes(birthdateParameterCommitment)) {
            console.warn("This proof does not verify the birthdate")
            isCorrect = false
            queryResultErrors.birthdate = {
              ...queryResultErrors.birthdate,
              commitment: {
                expected: `Birthdate parameter commitment: ${birthdateParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the birthdate",
              },
            }
          }
          const { isCorrect: isCorrectBirthdate, queryResultErrors: queryResultErrorsBirthdate } =
            this.checkBirthdatePublicInputs(proof, queryResult)
          isCorrect = isCorrect && isCorrectBirthdate
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsBirthdate,
          }
        }
        if (!!committedInputs?.compare_expiry || !!committedInputs?.compare_expiry_evm) {
          const expiryCommittedInputs =
            (committedInputs?.compare_expiry as DateCommittedInputs) ??
            (committedInputs?.compare_expiry_evm as DateCommittedInputs)
          const expiryParameterCommitment = isForEVM
            ? await getDateEVMParameterCommitment(
                ProofType.EXPIRY_DATE,
                expiryCommittedInputs.currentDateTimestamp,
                expiryCommittedInputs.minDateTimestamp,
                expiryCommittedInputs.maxDateTimestamp,
              )
            : await getDateParameterCommitment(
                ProofType.EXPIRY_DATE,
                expiryCommittedInputs.currentDateTimestamp,
                expiryCommittedInputs.minDateTimestamp,
                expiryCommittedInputs.maxDateTimestamp,
              )
          if (!paramCommitments.includes(expiryParameterCommitment)) {
            console.warn("This proof does not verify the expiry date")
            isCorrect = false
            queryResultErrors.expiry_date = {
              ...queryResultErrors.expiry_date,
              commitment: {
                expected: `Expiry date parameter commitment: ${expiryParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the expiry date",
              },
            }
          }
          const { isCorrect: isCorrectExpiryDate, queryResultErrors: queryResultErrorsExpiryDate } =
            this.checkExpiryDatePublicInputs(proof, queryResult)
          isCorrect = isCorrect && isCorrectExpiryDate
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsExpiryDate,
          }
        }
        if (!!committedInputs?.disclose_bytes || !!committedInputs?.disclose_bytes_evm) {
          const discloseCommittedInputs =
            (committedInputs?.disclose_bytes as DiscloseCommittedInputs) ??
            (committedInputs?.disclose_bytes_evm as DiscloseCommittedInputs)
          const discloseParameterCommitment = isForEVM
            ? await getDiscloseEVMParameterCommitment(
                discloseCommittedInputs.discloseMask,
                discloseCommittedInputs.disclosedBytes,
              )
            : await getDiscloseParameterCommitment(
                discloseCommittedInputs.discloseMask,
                discloseCommittedInputs.disclosedBytes,
              )
          if (!paramCommitments.includes(discloseParameterCommitment)) {
            console.warn("This proof does not verify any of the data disclosed")
            isCorrect = false
            queryResultErrors.disclose = {
              ...queryResultErrors.disclose,
              commitment: {
                expected: `Disclosure parameter commitment: ${discloseParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify any of the data disclosed",
              },
            }
          }
          const { isCorrect: isCorrectDisclose, queryResultErrors: queryResultErrorsDisclose } =
            this.checkDiscloseBytesPublicInputs(proof, queryResult)
          isCorrect = isCorrect && isCorrectDisclose
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsDisclose,
          }
        }
        if (
          !!committedInputs?.inclusion_check_nationality ||
          !!committedInputs?.inclusion_check_nationality_evm
        ) {
          const inclusionCheckNationalityCommittedInputs =
            (committedInputs?.inclusion_check_nationality as CountryCommittedInputs) ??
            (committedInputs?.inclusion_check_nationality_evm as CountryCommittedInputs)
          const inclusionCheckNationalityParameterCommitment = isForEVM
            ? await getCountryEVMParameterCommitment(
                ProofType.NATIONALITY_INCLUSION,
                inclusionCheckNationalityCommittedInputs.countries,
              )
            : await getCountryParameterCommitment(
                ProofType.NATIONALITY_INCLUSION,
                inclusionCheckNationalityCommittedInputs.countries,
              )
          if (!paramCommitments.includes(inclusionCheckNationalityParameterCommitment)) {
            console.warn("This proof does not verify the inclusion of the nationality")
            isCorrect = false
            queryResultErrors.nationality = {
              ...queryResultErrors.nationality,
              commitment: {
                expected: `Nationality parameter commitment: ${inclusionCheckNationalityParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the inclusion of the nationality",
              },
            }
          }
          const countryList = inclusionCheckNationalityCommittedInputs.countries
          const {
            isCorrect: isCorrectNationalityInclusion,
            queryResultErrors: queryResultErrorsNationalityInclusion,
          } = this.checkNationalityInclusionPublicInputs(queryResult, countryList)
          isCorrect = isCorrect && isCorrectNationalityInclusion
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsNationalityInclusion,
          }
        }
        if (
          !!committedInputs?.inclusion_check_issuing_country ||
          !!committedInputs?.inclusion_check_issuing_country_evm
        ) {
          const inclusionCheckIssuingCountryCommittedInputs =
            (committedInputs?.inclusion_check_issuing_country as CountryCommittedInputs) ??
            (committedInputs?.inclusion_check_issuing_country_evm as CountryCommittedInputs)
          const inclusionCheckIssuingCountryParameterCommitment = isForEVM
            ? await getCountryEVMParameterCommitment(
                ProofType.ISSUING_COUNTRY_INCLUSION,
                inclusionCheckIssuingCountryCommittedInputs.countries,
              )
            : await getCountryParameterCommitment(
                ProofType.ISSUING_COUNTRY_INCLUSION,
                inclusionCheckIssuingCountryCommittedInputs.countries,
              )
          if (!paramCommitments.includes(inclusionCheckIssuingCountryParameterCommitment)) {
            console.warn("This proof does not verify the inclusion of the issuing country")
            isCorrect = false
            queryResultErrors.issuing_country = {
              ...queryResultErrors.issuing_country,
              commitment: {
                expected: `Issuing country parameter commitment: ${inclusionCheckIssuingCountryParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the inclusion of the issuing country",
              },
            }
          }
          const countryList = inclusionCheckIssuingCountryCommittedInputs.countries
          const {
            isCorrect: isCorrectIssuingCountryInclusion,
            queryResultErrors: queryResultErrorsIssuingCountryInclusion,
          } = this.checkIssuingCountryInclusionPublicInputs(queryResult, countryList)
          isCorrect = isCorrect && isCorrectIssuingCountryInclusion
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsIssuingCountryInclusion,
          }
        }
        if (
          !!committedInputs?.exclusion_check_nationality ||
          !!committedInputs?.exclusion_check_nationality_evm
        ) {
          const exclusionCheckNationalityCommittedInputs =
            (committedInputs?.exclusion_check_nationality as CountryCommittedInputs) ??
            (committedInputs?.exclusion_check_nationality_evm as CountryCommittedInputs)
          const exclusionCheckNationalityParameterCommitment = isForEVM
            ? await getCountryEVMParameterCommitment(
                ProofType.NATIONALITY_EXCLUSION,
                exclusionCheckNationalityCommittedInputs.countries,
              )
            : await getCountryParameterCommitment(
                ProofType.NATIONALITY_EXCLUSION,
                exclusionCheckNationalityCommittedInputs.countries,
              )
          if (!paramCommitments.includes(exclusionCheckNationalityParameterCommitment)) {
            console.warn("This proof does not verify the exclusion of the nationality")
            isCorrect = false
            queryResultErrors.nationality = {
              ...queryResultErrors.nationality,
              commitment: {
                expected: `Nationality parameter commitment: ${exclusionCheckNationalityParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the exclusion of the nationality",
              },
            }
          }
          const countryList = exclusionCheckNationalityCommittedInputs.countries
          const {
            isCorrect: isCorrectNationalityExclusion,
            queryResultErrors: queryResultErrorsNationalityExclusion,
          } = this.checkNationalityExclusionPublicInputs(queryResult, countryList)
          isCorrect = isCorrect && isCorrectNationalityExclusion
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsNationalityExclusion,
          }
        }
        if (
          !!committedInputs?.exclusion_check_issuing_country ||
          !!committedInputs?.exclusion_check_issuing_country_evm
        ) {
          const exclusionCheckIssuingCountryCommittedInputs =
            (committedInputs?.exclusion_check_issuing_country as CountryCommittedInputs) ??
            (committedInputs?.exclusion_check_issuing_country_evm as CountryCommittedInputs)
          const exclusionCheckIssuingCountryParameterCommitment = isForEVM
            ? await getCountryEVMParameterCommitment(
                ProofType.ISSUING_COUNTRY_EXCLUSION,
                exclusionCheckIssuingCountryCommittedInputs.countries,
              )
            : await getCountryParameterCommitment(
                ProofType.ISSUING_COUNTRY_EXCLUSION,
                exclusionCheckIssuingCountryCommittedInputs.countries,
              )
          if (!paramCommitments.includes(exclusionCheckIssuingCountryParameterCommitment)) {
            console.warn("This proof does not verify the exclusion of the issuing country")
            isCorrect = false
            queryResultErrors.issuing_country = {
              ...queryResultErrors.issuing_country,
              commitment: {
                expected: `Issuing country parameter commitment: ${exclusionCheckIssuingCountryParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the exclusion of the issuing country",
              },
            }
          }
          const countryList = exclusionCheckIssuingCountryCommittedInputs.countries
          const {
            isCorrect: isCorrectIssuingCountryExclusion,
            queryResultErrors: queryResultErrorsIssuingCountryExclusion,
          } = this.checkIssuingCountryExclusionPublicInputs(queryResult, countryList)
          isCorrect = isCorrect && isCorrectIssuingCountryExclusion
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsIssuingCountryExclusion,
          }
        }
        if (!!committedInputs?.bind || !!committedInputs?.bind_evm) {
          const bindCommittedInputs =
            (committedInputs?.bind as BindCommittedInputs) ??
            (committedInputs?.bind_evm as BindCommittedInputs)
          const bindParameterCommitment = isForEVM
            ? await getBindEVMParameterCommitment(formatBoundData(bindCommittedInputs.data))
            : await getBindParameterCommitment(formatBoundData(bindCommittedInputs.data))
          if (!paramCommitments.includes(bindParameterCommitment)) {
            console.warn("This proof does not verify the bound data")
            isCorrect = false
            queryResultErrors.bind = {
              ...queryResultErrors.bind,
              commitment: {
                expected: `Bind parameter commitment: ${bindParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the bound data",
              },
            }
          }
          const { isCorrect: isCorrectBind, queryResultErrors: queryResultErrorsBind } =
            this.checkBindPublicInputs(queryResult, bindCommittedInputs.data)
          isCorrect = isCorrect && isCorrectBind
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsBind,
          }
        }
        if (
          !!committedInputs?.exclusion_check_sanctions ||
          !!committedInputs?.exclusion_check_sanctions_evm
        ) {
          const sanctionsBuilder = await SanctionsBuilder.create()
          const exclusionCheckSanctionsCommittedInputs =
            (committedInputs?.exclusion_check_sanctions as SanctionsCommittedInputs) ??
            (committedInputs?.exclusion_check_sanctions_evm as SanctionsCommittedInputs)
          const exclusionCheckSanctionsParameterCommitment = isForEVM
            ? await sanctionsBuilder.getSanctionsEvmParameterCommitment()
            : await sanctionsBuilder.getSanctionsParameterCommitment()
          if (!paramCommitments.includes(exclusionCheckSanctionsParameterCommitment)) {
            console.warn("This proof does not verify the exclusion from the sanction lists")
            isCorrect = false
            queryResultErrors.sanctions = {
              ...queryResultErrors.sanctions,
              commitment: {
                expected: `Sanctions parameter commitment: ${exclusionCheckSanctionsParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify the exclusion from the sanction lists",
              },
            }
          }
          const {
            isCorrect: isCorrectSanctionsExclusion,
            queryResultErrors: queryResultErrorsSanctionsExclusion,
          } = await this.checkSanctionsExclusionPublicInputs(
            queryResult,
            exclusionCheckSanctionsCommittedInputs.rootHash,
            sanctionsBuilder,
          )
          isCorrect = isCorrect && isCorrectSanctionsExclusion
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsSanctionsExclusion,
          }
        }
        if (!!committedInputs?.facematch || !!committedInputs?.facematch_evm) {
          const facematchCommittedInputs =
            (committedInputs?.facematch as FacematchCommittedInputs) ??
            (committedInputs?.facematch_evm as FacematchCommittedInputs)
          const facematchParameterCommitment = isForEVM
            ? await getFacematchEvmParameterCommitment(
                BigInt(facematchCommittedInputs.rootKeyLeaf),
                facematchCommittedInputs.environment === "development" ? 0n : 1n,
                BigInt(facematchCommittedInputs.appId),
                facematchCommittedInputs.mode === "regular" ? 1n : 2n,
              )
            : await getFacematchParameterCommitment(
                BigInt(facematchCommittedInputs.rootKeyLeaf),
                facematchCommittedInputs.environment === "development" ? 0n : 1n,
                BigInt(facematchCommittedInputs.appId),
                facematchCommittedInputs.mode === "regular" ? 1n : 2n,
              )
          if (!paramCommitments.includes(facematchParameterCommitment)) {
            console.warn("This proof does not verify FaceMatch")
            isCorrect = false
            queryResultErrors.facematch = {
              ...queryResultErrors.facematch,
              commitment: {
                expected: `Facematch parameter commitment: ${facematchParameterCommitment.toString()}`,
                received: `Parameter commitments included: ${paramCommitments.join(", ")}`,
                message: "This proof does not verify FaceMatch",
              },
            }
          }
          const { isCorrect: isCorrectFacematch, queryResultErrors: queryResultErrorsFacematch } =
            await this.checkFacematchPublicInputs(queryResult, facematchCommittedInputs)
          isCorrect = isCorrect && isCorrectFacematch
          queryResultErrors = {
            ...queryResultErrors,
            ...queryResultErrorsFacematch,
          }
        }
        uniqueIdentifier = getNullifierFromOuterProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromOuterProof(proofData)
      } else if (proof.name?.startsWith("sig_check_dsc")) {
        commitmentOut = getCommitmentFromDSCProof(proofData)
        const merkleRoot = getMerkleRootFromDSCProof(proofData)
        const {
          isCorrect: isCorrectCertificateRegistryRoot,
          queryResultErrors: queryResultErrorsCertificateRegistryRoot,
        } = await this.checkCertificateRegistryRoot(
          merkleRoot.toString(16),
          queryResultErrors,
          false,
        )
        isCorrect = isCorrect && isCorrectCertificateRegistryRoot
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCertificateRegistryRoot,
        }
      } else if (proof.name?.startsWith("sig_check_id_data")) {
        commitmentIn = getCommitmentInFromIDDataProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the certificate signature and ID signature",
          )
          isCorrect = false
          queryResultErrors.sig_check_id_data = {
            ...queryResultErrors.sig_check_id_data,
            commitment: {
              expected: `Commitment: ${commitmentOut?.toString() || "undefined"}`,
              received: `Commitment: ${commitmentIn?.toString() || "undefined"}`,
              message:
                "Failed to check the link between the certificate signature and ID signature",
            },
          }
        }
        commitmentOut = getCommitmentOutFromIDDataProof(proofData)
      } else if (proof.name?.startsWith("data_check_integrity")) {
        commitmentIn = getCommitmentInFromIntegrityProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn("Failed to check the link between the ID signature and the data signed")
          isCorrect = false
          queryResultErrors.data_check_integrity = {
            ...queryResultErrors.data_check_integrity,
            commitment: {
              expected: `Commitment: ${commitmentOut?.toString() || "undefined"}`,
              received: `Commitment: ${commitmentIn?.toString() || "undefined"}`,
              message: "Failed to check the link between the ID signature and the data signed",
            },
          }
        }
        commitmentOut = getCommitmentOutFromIntegrityProof(proofData)
        const currentDate = getCurrentDateFromIntegrityProof(proofData)
        const todayToCurrentDate = today.getTime() - currentDate.getTime()
        const expectedDifference = validity ? validity * 1000 : DEFAULT_VALIDITY * 1000
        const actualDifference = today.getTime() - (today.getTime() - expectedDifference)
        if (todayToCurrentDate >= actualDifference) {
          console.warn(
            `The date used to check the validity of the ID is older than the validity period`,
          )
          isCorrect = false
          queryResultErrors.data_check_integrity = {
            ...queryResultErrors.data_check_integrity,
            date: {
              expected: `Difference: ${validity} seconds`,
              received: `Difference: ${Math.round(todayToCurrentDate / 1000)} seconds`,
              message:
                "The date used to check the validity of the ID is older than the validity period",
            },
          }
        }
      } else if (proof.name === "disclose_bytes") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the data to disclose",
          )
          isCorrect = false
          queryResultErrors.disclose = {
            ...queryResultErrors.disclose,
            commitment: {
              expected: `Commitment: ${commitmentOut?.toString() || "undefined"}`,
              received: `Commitment: ${commitmentIn?.toString() || "undefined"}`,
              message:
                "Failed to check the link between the validity of the ID and the data to disclose",
            },
          }
        }
        const paramCommitment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getDiscloseParameterCommitment(
          (proof.committedInputs?.disclose_bytes as DiscloseCommittedInputs).discloseMask!,
          (proof.committedInputs?.disclose_bytes as DiscloseCommittedInputs).disclosedBytes!,
        )
        if (paramCommitment !== calculatedParamCommitment) {
          console.warn("The disclosed data does not match the data committed by the proof")
          isCorrect = false
          queryResultErrors.disclose = {
            ...queryResultErrors.disclose,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommitment}`,
              message: "The disclosed data does not match the data committed by the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "disclose",
            scope,
          )
        isCorrect = isCorrect && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectDisclose, queryResultErrors: queryResultErrorsDisclose } =
          this.checkDiscloseBytesPublicInputs(proof, queryResult)
        isCorrect = isCorrect && isCorrectDisclose && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsDisclose,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "compare_age") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the age derived from it",
          )
          isCorrect = false
          queryResultErrors.age = {
            ...queryResultErrors.age,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the age derived from it",
            },
          }
        }
        const paramCommitment = getParameterCommitmentFromDisclosureProof(proofData)
        const committedInputs = proof.committedInputs?.compare_age as AgeCommittedInputs
        const calculatedParamCommitment = await getAgeParameterCommitment(
          committedInputs.currentDateTimestamp,
          committedInputs.minAge,
          committedInputs.maxAge,
        )
        if (paramCommitment !== calculatedParamCommitment) {
          console.warn(
            "The conditions for the age check do not match the conditions checked by the proof",
          )
          isCorrect = false
          queryResultErrors.age = {
            ...queryResultErrors.age,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommitment}`,
              message:
                "The conditions for the age check do not match the conditions checked by the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(domain, proofData, queryResultErrors, "age", scope)
        const { isCorrect: isCorrectAge, queryResultErrors: queryResultErrorsAge } =
          this.checkAgePublicInputs(proof, queryResult)
        isCorrect = isCorrect && isCorrectAge && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsAge,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "compare_birthdate") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the birthdate derived from it",
          )
          isCorrect = false
          queryResultErrors.birthdate = {
            ...queryResultErrors.birthdate,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the birthdate derived from it",
            },
          }
        }
        const paramCommitment = getParameterCommitmentFromDisclosureProof(proofData)
        const committedInputs = proof.committedInputs?.compare_birthdate as DateCommittedInputs
        const calculatedParamCommitment = await getDateParameterCommitment(
          ProofType.BIRTHDATE,
          committedInputs.currentDateTimestamp,
          committedInputs.minDateTimestamp,
          committedInputs.maxDateTimestamp,
          0,
        )
        if (paramCommitment !== calculatedParamCommitment) {
          console.warn(
            "The conditions for the birthdate check do not match the conditions checked by the proof",
          )
          isCorrect = false
          queryResultErrors.birthdate = {
            ...queryResultErrors.birthdate,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommitment}`,
              message:
                "The conditions for the birthdate check do not match the conditions checked by the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "birthdate",
            scope,
          )
        const { isCorrect: isCorrectBirthdate, queryResultErrors: queryResultErrorsBirthdate } =
          this.checkBirthdatePublicInputs(proof, queryResult)
        isCorrect = isCorrect && isCorrectBirthdate && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsBirthdate,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "compare_expiry") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and its expiry date",
          )
          isCorrect = false
          queryResultErrors.expiry_date = {
            ...queryResultErrors.expiry_date,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and its expiry date",
            },
          }
        }
        const paramCommitment = getParameterCommitmentFromDisclosureProof(proofData)
        const committedInputs = proof.committedInputs?.compare_expiry as DateCommittedInputs
        const calculatedParamCommitment = await getDateParameterCommitment(
          ProofType.EXPIRY_DATE,
          committedInputs.currentDateTimestamp,
          committedInputs.minDateTimestamp,
          committedInputs.maxDateTimestamp,
        )
        if (paramCommitment !== calculatedParamCommitment) {
          console.warn(
            "The conditions for the expiry date check do not match the conditions checked by the proof",
          )
          isCorrect = false
          queryResultErrors.expiry_date = {
            ...queryResultErrors.expiry_date,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommitment}`,
              message:
                "The conditions for the expiry date check do not match the conditions checked by the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "expiry_date",
            scope,
          )
        const { isCorrect: isCorrectExpiryDate, queryResultErrors: queryResultErrorsExpiryDate } =
          this.checkExpiryDatePublicInputs(proof, queryResult)
        isCorrect = isCorrect && isCorrectExpiryDate && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsExpiryDate,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "exclusion_check_nationality") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the nationality exclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality = {
            ...queryResultErrors.nationality,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the nationality exclusion check",
            },
          }
        }
        const countryList = (
          proof.committedInputs?.exclusion_check_nationality as CountryCommittedInputs
        ).countries
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getCountryParameterCommitment(
          ProofType.NATIONALITY_EXCLUSION,
          countryList,
          true,
        )
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn(
            "The committed country list for the exclusion check does not match the one from the proof",
          )
          isCorrect = false
          queryResultErrors.nationality = {
            ...queryResultErrors.nationality,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommittment}`,
              message:
                "The committed country list for the exclusion check does not match the one from the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "nationality",
            scope,
          )
        const {
          isCorrect: isCorrectNationalityExclusion,
          queryResultErrors: queryResultErrorsNationalityExclusion,
        } = this.checkNationalityExclusionPublicInputs(queryResult, countryList)
        isCorrect = isCorrect && isCorrectNationalityExclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsNationalityExclusion,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "exclusion_check_issuing_country") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the issuing country exclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality = {
            ...queryResultErrors.nationality,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the issuing country exclusion check",
            },
          }
        }
        const countryList = (
          proof.committedInputs?.exclusion_check_issuing_country as CountryCommittedInputs
        ).countries
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getCountryParameterCommitment(
          ProofType.ISSUING_COUNTRY_EXCLUSION,
          countryList,
          true,
        )
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn(
            "The committed country list for the issuing country exclusion check does not match the one from the proof",
          )
          isCorrect = false
          queryResultErrors.issuing_country = {
            ...queryResultErrors.issuing_country,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommittment}`,
              message:
                "The committed country list for the issuing country exclusion check does not match the one from the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "nationality",
            scope,
          )
        const {
          isCorrect: isCorrectIssuingCountryExclusion,
          queryResultErrors: queryResultErrorsIssuingCountryExclusion,
        } = this.checkIssuingCountryExclusionPublicInputs(queryResult, countryList)
        isCorrect = isCorrect && isCorrectIssuingCountryExclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsIssuingCountryExclusion,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "inclusion_check_nationality") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the nationality inclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality = {
            ...queryResultErrors.nationality,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the nationality inclusion check",
            },
          }
        }
        const countryList = (
          proof.committedInputs?.inclusion_check_nationality as CountryCommittedInputs
        ).countries
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getCountryParameterCommitment(
          ProofType.NATIONALITY_INCLUSION,
          countryList,
          false,
        )
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn(
            "The committed country list for the nationality inclusion check does not match the one from the proof",
          )
          isCorrect = false
          queryResultErrors.nationality = {
            ...queryResultErrors.nationality,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommittment}`,
              message:
                "The committed country list for the nationality inclusion check does not match the one from the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "nationality",
            scope,
          )
        const {
          isCorrect: isCorrectNationalityInclusion,
          queryResultErrors: queryResultErrorsNationalityInclusion,
        } = this.checkNationalityInclusionPublicInputs(queryResult, countryList)
        isCorrect = isCorrect && isCorrectNationalityInclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsNationalityInclusion,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "inclusion_check_issuing_country") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the issuing country inclusion check",
          )
          isCorrect = false
          queryResultErrors.nationality = {
            ...queryResultErrors.nationality,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the issuing country inclusion check",
            },
          }
        }
        const countryList = (
          proof.committedInputs?.inclusion_check_issuing_country as CountryCommittedInputs
        ).countries
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getCountryParameterCommitment(
          ProofType.ISSUING_COUNTRY_INCLUSION,
          countryList,
          false,
        )
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn(
            "The committed country list for the issuing country inclusion check does not match the one from the proof",
          )
          isCorrect = false
          queryResultErrors.issuing_country = {
            ...queryResultErrors.issuing_country,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommittment}`,
              message:
                "The committed country list for the issuing country inclusion check does not match the one from the proof",
            },
          }
        }
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "nationality",
            scope,
          )
        const {
          isCorrect: isCorrectIssuingCountryInclusion,
          queryResultErrors: queryResultErrorsIssuingCountryInclusion,
        } = this.checkIssuingCountryInclusionPublicInputs(queryResult, countryList)
        isCorrect = isCorrect && isCorrectIssuingCountryInclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsIssuingCountryInclusion,
          ...queryResultErrorsScope,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "bind") {
        const bindCommittedInputs = proof.committedInputs?.bind as BindCommittedInputs
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getBindParameterCommitment(
          formatBoundData(bindCommittedInputs.data),
        )
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn("The bound data does not match the one from the proof")
          isCorrect = false
          queryResultErrors.bind = {
            ...queryResultErrors.bind,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment}`,
              received: `Commitment: ${paramCommittment}`,
              message: "The bound data does not match the one from the proof",
            },
          }
        }
        const { isCorrect: isCorrectBind, queryResultErrors: queryResultErrorsBind } =
          this.checkBindPublicInputs(queryResult, bindCommittedInputs.data)
        isCorrect = isCorrect && isCorrectBind
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsBind,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "exclusion_check_sanctions") {
        const sanctionsBuilder = await SanctionsBuilder.create()
        const exclusionCheckSanctionsCommittedInputs = proof.committedInputs
          ?.exclusion_check_sanctions as SanctionsCommittedInputs
        const calculatedParamCommitment = await sanctionsBuilder.getSanctionsParameterCommitment()
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn(
            "The sanction lists check against do not match the sanction lists from the proof",
          )
          isCorrect = false
          queryResultErrors.sanctions = {
            ...queryResultErrors.sanctions,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment.toString()}`,
              received: `Commitment: ${paramCommittment.toString()}`,
              message:
                "The sanction lists check against do not match the sanction lists from the proof",
            },
          }
        }
        const {
          isCorrect: isCorrectSanctionsExclusion,
          queryResultErrors: queryResultErrorsSanctionsExclusion,
        } = await this.checkSanctionsExclusionPublicInputs(
          queryResult,
          exclusionCheckSanctionsCommittedInputs.rootHash,
          sanctionsBuilder,
        )
        isCorrect = isCorrect && isCorrectSanctionsExclusion
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsSanctionsExclusion,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name?.startsWith("facematch") && !proof.name?.endsWith("_evm")) {
        const facematchCommittedInputs = proof.committedInputs
          ?.facematch as FacematchCommittedInputs
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getFacematchParameterCommitment(
          BigInt(facematchCommittedInputs.rootKeyLeaf),
          facematchCommittedInputs.environment === "development" ? 0n : 1n,
          BigInt(facematchCommittedInputs.appId),
          facematchCommittedInputs.mode === "regular" ? 1n : 2n,
        )
        if (paramCommittment !== calculatedParamCommitment) {
          console.warn("The FaceMatch verification does not match the ones from the proof")
          isCorrect = false
          queryResultErrors.facematch = {
            ...queryResultErrors.facematch,
            commitment: {
              expected: `Commitment: ${calculatedParamCommitment.toString()}`,
              received: `Commitment: ${paramCommittment.toString()}`,
              message: "The FaceMatch verification does not match the ones from the proof",
            },
          }
        }
        const { isCorrect: isCorrectFacematch, queryResultErrors: queryResultErrorsFacematch } =
          await this.checkFacematchPublicInputs(queryResult, facematchCommittedInputs)
        isCorrect = isCorrect && isCorrectFacematch
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsFacematch,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      }
    }
    return { isCorrect, uniqueIdentifier, uniqueIdentifierType, queryResultErrors }
  }
}
