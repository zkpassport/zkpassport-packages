/* eslint-disable @typescript-eslint/no-explicit-any */

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
  getCurrentDateFromDisclosureProof,
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
  getServiceScopeFromDisclosureProof,
  getServiceSubScopeFromDisclosureProof,
  getOprfPkHashFromDisclosureProof,
  OPRF_DEFAULT_KEY_ID,
  getOprfPublicKey,
  hashOprfPublicKey,
  Query,
} from "@zkpassport/utils"
import { QueryResultErrors } from "./types"
import { RegistryClient } from "@zkpassport/registry"
// import { MockRegistryClient as RegistryClient } from "@zkpassport/registry/mock"
import {
  APPLE_APP_ATTEST_ROOT_KEY_HASH,
  DEFAULT_DATE_VALUE,
  DEFAULT_VALIDITY,
  GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH,
  GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH,
  ZKPASSPORT_ANDROID_APP_ID_HASH,
  ZKPASSPORT_IOS_APP_ID_HASH,
} from "./constants"

export class PublicInputChecker {
  public static checkDiscloseBytesPublicInputs(
    proof: ProofResult,
    originalQuery: Query,
    queryResult: QueryResult,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    // We can't be certain that the disclosed data is for a passport or an ID card
    // so we need to check both (unless the document type is revealed)
    const disclosedBytes =
      (proof.committedInputs?.disclose_bytes as DiscloseCommittedInputs)?.disclosedBytes ??
      (proof.committedInputs?.disclose_bytes_evm as DiscloseCommittedInputs)?.disclosedBytes
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
      if (
        queryResult.document_type.disclose &&
        queryResult.document_type.disclose.result !== disclosedDataIDCard.documentType
      ) {
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
      if (
        queryResult.document_type.eq &&
        (originalQuery.document_type?.eq === undefined ||
          queryResult.document_type.eq.expected !== originalQuery.document_type.eq)
      ) {
        console.warn("Document type eq does not match the original query")
        isCorrect = false
        queryResultErrors.document_type = {
          ...queryResultErrors.document_type,
          eq: {
            expected: `${originalQuery.document_type?.eq}`,
            received: `${queryResult.document_type.eq.expected}`,
            message: "Document type eq does not match the original query",
          },
        }
      }
      if (queryResult.document_type.disclose && !originalQuery.document_type?.disclose) {
        console.warn("Document type disclose is not in the original query")
        isCorrect = false
        queryResultErrors.document_type = {
          ...queryResultErrors.document_type,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.document_type.disclose.result}`,
            message: "Document type disclose is not in the original query",
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
      if (
        queryResult.birthdate.eq &&
        (originalQuery.birthdate?.eq === undefined ||
          !areDatesEqual(queryResult.birthdate.eq.expected, originalQuery.birthdate.eq as Date))
      ) {
        console.warn("Birthdate eq does not match the original query")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          eq: {
            expected: `${(originalQuery.birthdate?.eq as Date)?.toISOString?.() ?? "undefined"}`,
            received: `${queryResult.birthdate.eq.expected.toISOString()}`,
            message: "Birthdate eq does not match the original query",
          },
        }
      }
      if (queryResult.birthdate.disclose && !originalQuery.birthdate?.disclose) {
        console.warn("Birthdate disclose is not in the original query")
        isCorrect = false
        queryResultErrors.birthdate = {
          ...queryResultErrors.birthdate,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.birthdate.disclose.result}`,
            message: "Birthdate disclose is not in the original query",
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
      if (
        queryResult.expiry_date.eq &&
        (originalQuery.expiry_date?.eq === undefined ||
          !areDatesEqual(queryResult.expiry_date.eq.expected, originalQuery.expiry_date.eq as Date))
      ) {
        console.warn("Expiry date eq does not match the original query")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          eq: {
            expected: `${(originalQuery.expiry_date?.eq as Date)?.toISOString?.() ?? "undefined"}`,
            received: `${queryResult.expiry_date.eq.expected.toISOString()}`,
            message: "Expiry date eq does not match the original query",
          },
        }
      }
      if (queryResult.expiry_date.disclose && !originalQuery.expiry_date?.disclose) {
        console.warn("Expiry date disclose is not in the original query")
        isCorrect = false
        queryResultErrors.expiry_date = {
          ...queryResultErrors.expiry_date,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.expiry_date.disclose.result}`,
            message: "Expiry date disclose is not in the original query",
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
      if (
        queryResult.nationality.eq &&
        (originalQuery.nationality?.eq === undefined ||
          queryResult.nationality.eq.expected !== originalQuery.nationality.eq)
      ) {
        console.warn("Nationality eq does not match the original query")
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          eq: {
            expected: `${originalQuery.nationality?.eq}`,
            received: `${queryResult.nationality.eq.expected}`,
            message: "Nationality eq does not match the original query",
          },
        }
      }
      if (queryResult.nationality.disclose && !originalQuery.nationality?.disclose) {
        console.warn("Nationality disclose is not in the original query")
        isCorrect = false
        queryResultErrors.nationality = {
          ...queryResultErrors.nationality,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.nationality.disclose.result}`,
            message: "Nationality disclose is not in the original query",
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
      if (
        queryResult.document_number.eq &&
        (originalQuery.document_number?.eq === undefined ||
          queryResult.document_number.eq.expected !== originalQuery.document_number.eq)
      ) {
        console.warn("Document number eq does not match the original query")
        isCorrect = false
        queryResultErrors.document_number = {
          ...queryResultErrors.document_number,
          eq: {
            expected: `${originalQuery.document_number?.eq}`,
            received: `${queryResult.document_number.eq.expected}`,
            message: "Document number eq does not match the original query",
          },
        }
      }
      if (queryResult.document_number.disclose && !originalQuery.document_number?.disclose) {
        console.warn("Document number disclose is not in the original query")
        isCorrect = false
        queryResultErrors.document_number = {
          ...queryResultErrors.document_number,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.document_number.disclose.result}`,
            message: "Document number disclose is not in the original query",
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
      if (
        queryResult.gender.eq &&
        (originalQuery.gender?.eq === undefined ||
          queryResult.gender.eq.expected !== originalQuery.gender.eq)
      ) {
        console.warn("Gender eq does not match the original query")
        isCorrect = false
        queryResultErrors.gender = {
          ...queryResultErrors.gender,
          eq: {
            expected: `${originalQuery.gender?.eq}`,
            received: `${queryResult.gender.eq.expected}`,
            message: "Gender eq does not match the original query",
          },
        }
      }
      if (queryResult.gender.disclose && !originalQuery.gender?.disclose) {
        console.warn("Gender disclose is not in the original query")
        isCorrect = false
        queryResultErrors.gender = {
          ...queryResultErrors.gender,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.gender.disclose.result}`,
            message: "Gender disclose is not in the original query",
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
      if (
        queryResult.issuing_country.eq &&
        (originalQuery.issuing_country?.eq === undefined ||
          queryResult.issuing_country.eq.expected !== originalQuery.issuing_country.eq)
      ) {
        console.warn("Issuing country eq does not match the original query")
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          eq: {
            expected: `${originalQuery.issuing_country?.eq}`,
            received: `${queryResult.issuing_country.eq.expected}`,
            message: "Issuing country eq does not match the original query",
          },
        }
      }
      if (queryResult.issuing_country.disclose && !originalQuery.issuing_country?.disclose) {
        console.warn("Issuing country disclose is not in the original query")
        isCorrect = false
        queryResultErrors.issuing_country = {
          ...queryResultErrors.issuing_country,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.issuing_country.disclose.result}`,
            message: "Issuing country disclose is not in the original query",
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
      if (
        queryResult.fullname.eq &&
        (originalQuery.fullname?.eq === undefined ||
          formatName(queryResult.fullname.eq.expected).toLowerCase() !==
            formatName(originalQuery.fullname.eq as string).toLowerCase())
      ) {
        console.warn("Fullname eq does not match the original query")
        isCorrect = false
        queryResultErrors.fullname = {
          ...queryResultErrors.fullname,
          eq: {
            expected: `${originalQuery.fullname?.eq}`,
            received: `${queryResult.fullname.eq.expected}`,
            message: "Fullname eq does not match the original query",
          },
        }
      }
      if (queryResult.fullname.disclose && !originalQuery.fullname?.disclose) {
        console.warn("Fullname disclose is not in the original query")
        isCorrect = false
        queryResultErrors.fullname = {
          ...queryResultErrors.fullname,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.fullname.disclose.result}`,
            message: "Fullname disclose is not in the original query",
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
      if (
        queryResult.firstname.eq &&
        (originalQuery.firstname?.eq === undefined ||
          formatName(queryResult.firstname.eq.expected).toLowerCase() !==
            formatName(originalQuery.firstname.eq as string).toLowerCase())
      ) {
        console.warn("Firstname eq does not match the original query")
        isCorrect = false
        queryResultErrors.firstname = {
          ...queryResultErrors.firstname,
          eq: {
            expected: `${originalQuery.firstname?.eq}`,
            received: `${queryResult.firstname.eq.expected}`,
            message: "Firstname eq does not match the original query",
          },
        }
      }
      if (queryResult.firstname.disclose && !originalQuery.firstname?.disclose) {
        console.warn("Firstname disclose is not in the original query")
        isCorrect = false
        queryResultErrors.firstname = {
          ...queryResultErrors.firstname,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.firstname.disclose.result}`,
            message: "Firstname disclose is not in the original query",
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
      if (
        queryResult.lastname.eq &&
        (originalQuery.lastname?.eq === undefined ||
          formatName(queryResult.lastname.eq.expected).toLowerCase() !==
            formatName(originalQuery.lastname.eq as string).toLowerCase())
      ) {
        console.warn("Lastname eq does not match the original query")
        isCorrect = false
        queryResultErrors.lastname = {
          ...queryResultErrors.lastname,
          eq: {
            expected: `${originalQuery.lastname?.eq}`,
            received: `${queryResult.lastname.eq.expected}`,
            message: "Lastname eq does not match the original query",
          },
        }
      }
      if (queryResult.lastname.disclose && !originalQuery.lastname?.disclose) {
        console.warn("Lastname disclose is not in the original query")
        isCorrect = false
        queryResultErrors.lastname = {
          ...queryResultErrors.lastname,
          disclose: {
            expected: "Not requested in original query",
            received: `${queryResult.lastname.disclose.result}`,
            message: "Lastname disclose is not in the original query",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkAgePublicInputs(
    proof: ProofResult,
    originalQuery: Query,
    queryResult: QueryResult,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    const currentTime = new Date()
    // TODO: Fix unused variable
    const _today = new Date(
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
        queryResult.age.gt &&
        queryResult.age.gt.result &&
        minAge !== (queryResult.age.gt.expected as number) + 1
      ) {
        console.warn("Age is not greater than the expected age")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          gt: {
            expected: queryResult.age.gt.expected,
            received: minAge,
            message: "Age is not greater than the expected age",
          },
        }
      }
      if (
        queryResult.age.lt &&
        queryResult.age.lt.result &&
        maxAge !== (queryResult.age.lt.expected as number) - 1
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
      if (
        queryResult.age.lte &&
        queryResult.age.lte.result &&
        maxAge !== (queryResult.age.lte.expected as number)
      ) {
        console.warn("Age is not less than or equal to the expected age")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          lte: {
            expected: queryResult.age.lte.expected,
            received: maxAge,
            message: "Age is not less than or equal to the expected age",
          },
        }
      }
      if (
        queryResult.age.eq &&
        queryResult.age.eq.result &&
        (minAge !== (queryResult.age.eq.expected as number) ||
          maxAge !== (queryResult.age.eq.expected as number))
      ) {
        console.warn("Age does not match the expected age")
        isCorrect = false
        queryResultErrors.age = {
          ...queryResultErrors.age,
          eq: {
            expected: queryResult.age.eq.expected,
            received: minAge !== (queryResult.age.eq.expected as number) ? minAge : maxAge,
            message: "Age does not match the expected age",
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
    if (
      queryResult.age?.gte &&
      (originalQuery.age?.gte === undefined ||
        queryResult.age.gte.expected !== originalQuery.age.gte)
    ) {
      console.warn("Age gte does not match the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        gte: {
          expected: originalQuery.age?.gte,
          received: queryResult.age.gte.expected,
          message: "Age gte does not match the original query",
        },
      }
    }
    if (
      queryResult.age?.gt &&
      (originalQuery.age?.gt === undefined || queryResult.age.gt.expected !== originalQuery.age.gt)
    ) {
      console.warn("Age gt does not match the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        gt: {
          expected: originalQuery.age?.gt,
          received: queryResult.age.gt.expected,
          message: "Age gt does not match the original query",
        },
      }
    }
    if (
      queryResult.age?.lt &&
      (originalQuery.age?.lt === undefined || queryResult.age.lt.expected !== originalQuery.age.lt)
    ) {
      console.warn("Age lt does not match the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        lt: {
          expected: originalQuery.age?.lt,
          received: queryResult.age.lt.expected,
          message: "Age lt does not match the original query",
        },
      }
    }
    if (
      queryResult.age?.lte &&
      (originalQuery.age?.lte === undefined ||
        queryResult.age.lte.expected !== originalQuery.age.lte)
    ) {
      console.warn("Age lte does not match the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        lte: {
          expected: originalQuery.age?.lte,
          received: queryResult.age.lte.expected,
          message: "Age lte does not match the original query",
        },
      }
    }
    if (
      queryResult.age?.eq &&
      (originalQuery.age?.eq === undefined || queryResult.age.eq.expected !== originalQuery.age.eq)
    ) {
      console.warn("Age eq does not match the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        eq: {
          expected: originalQuery.age?.eq,
          received: queryResult.age.eq.expected,
          message: "Age eq does not match the original query",
        },
      }
    }
    if (
      queryResult.age?.range &&
      (originalQuery.age?.range === undefined ||
        queryResult.age.range.expected[0] !== originalQuery.age.range[0] ||
        queryResult.age.range.expected[1] !== originalQuery.age.range[1])
    ) {
      console.warn("Age range does not match the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        range: {
          expected: originalQuery.age?.range,
          received: queryResult.age.range.expected,
          message: "Age range does not match the original query",
        },
      }
    }
    if (queryResult.age?.disclose && !originalQuery.age?.disclose) {
      console.warn("Age disclose is not in the original query")
      isCorrect = false
      queryResultErrors.age = {
        ...queryResultErrors.age,
        disclose: {
          expected: "Not requested in original query",
          received: `${queryResult.age.disclose.result}`,
          message: "Age disclose is not in the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkBirthdatePublicInputs(
    proof: ProofResult,
    originalQuery: Query,
    queryResult: QueryResult,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    const currentTime = new Date()
    // TODO: Fix unused variable
    const _today = new Date(
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
      if (queryResult.birthdate.gt && queryResult.birthdate.gt.result) {
        const expectedPlusOneDay = new Date(queryResult.birthdate.gt.expected as Date)
        expectedPlusOneDay.setDate(expectedPlusOneDay.getDate() + 1)
        if (!areDatesEqual(minDate, expectedPlusOneDay)) {
          console.warn("Birthdate is not greater than the expected birthdate")
          isCorrect = false
          queryResultErrors.birthdate = {
            ...queryResultErrors.birthdate,
            gt: {
              expected: queryResult.birthdate.gt.expected,
              received: minDate,
              message: "Birthdate is not greater than the expected birthdate",
            },
          }
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
      if (queryResult.birthdate.lt && queryResult.birthdate.lt.result) {
        const expectedMinusOneDay = new Date(queryResult.birthdate.lt.expected as Date)
        expectedMinusOneDay.setDate(expectedMinusOneDay.getDate() - 1)
        if (!areDatesEqual(maxDate, expectedMinusOneDay)) {
          console.warn("Birthdate is not less than the expected birthdate")
          isCorrect = false
          queryResultErrors.birthdate = {
            ...queryResultErrors.birthdate,
            lt: {
              expected: queryResult.birthdate.lt.expected,
              received: maxDate,
              message: "Birthdate is not less than the expected birthdate",
            },
          }
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
      queryResult.birthdate?.gte &&
      (originalQuery.birthdate?.gte === undefined ||
        !areDatesEqual(queryResult.birthdate.gte.expected, originalQuery.birthdate.gte as Date))
    ) {
      console.warn("Birthdate gte does not match the original query")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        gte: {
          expected: originalQuery.birthdate?.gte,
          received: queryResult.birthdate.gte.expected,
          message: "Birthdate gte does not match the original query",
        },
      }
    }
    if (
      queryResult.birthdate?.gt &&
      (originalQuery.birthdate?.gt === undefined ||
        !areDatesEqual(queryResult.birthdate.gt.expected, originalQuery.birthdate.gt as Date))
    ) {
      console.warn("Birthdate gt does not match the original query")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        gt: {
          expected: originalQuery.birthdate?.gt,
          received: queryResult.birthdate.gt.expected,
          message: "Birthdate gt does not match the original query",
        },
      }
    }
    if (
      queryResult.birthdate?.lte &&
      (originalQuery.birthdate?.lte === undefined ||
        !areDatesEqual(queryResult.birthdate.lte.expected, originalQuery.birthdate.lte as Date))
    ) {
      console.warn("Birthdate lte does not match the original query")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        lte: {
          expected: originalQuery.birthdate?.lte,
          received: queryResult.birthdate.lte.expected,
          message: "Birthdate lte does not match the original query",
        },
      }
    }
    if (
      queryResult.birthdate?.lt &&
      (originalQuery.birthdate?.lt === undefined ||
        !areDatesEqual(queryResult.birthdate.lt.expected, originalQuery.birthdate.lt as Date))
    ) {
      console.warn("Birthdate lt does not match the original query")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        lt: {
          expected: originalQuery.birthdate?.lt,
          received: queryResult.birthdate.lt.expected,
          message: "Birthdate lt does not match the original query",
        },
      }
    }
    if (
      queryResult.birthdate?.range &&
      (originalQuery.birthdate?.range === undefined ||
        !areDatesEqual(
          queryResult.birthdate.range.expected[0],
          originalQuery.birthdate.range[0] as Date,
        ) ||
        !areDatesEqual(
          queryResult.birthdate.range.expected[1],
          originalQuery.birthdate.range[1] as Date,
        ))
    ) {
      console.warn("Birthdate range does not match the original query")
      isCorrect = false
      queryResultErrors.birthdate = {
        ...queryResultErrors.birthdate,
        range: {
          expected: originalQuery.birthdate?.range,
          received: queryResult.birthdate.range.expected,
          message: "Birthdate range does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkExpiryDatePublicInputs(
    proof: ProofResult,
    originalQuery: Query,
    queryResult: QueryResult,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    const currentTime = new Date()
    // TODO: Fix unused variable
    const _today = new Date(
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
      queryResult.expiry_date?.gte &&
      (originalQuery.expiry_date?.gte === undefined ||
        !areDatesEqual(queryResult.expiry_date.gte.expected, originalQuery.expiry_date.gte as Date))
    ) {
      console.warn("Expiry date gte does not match the original query")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        gte: {
          expected: originalQuery.expiry_date?.gte,
          received: queryResult.expiry_date.gte.expected,
          message: "Expiry date gte does not match the original query",
        },
      }
    }
    if (
      queryResult.expiry_date?.gt &&
      (originalQuery.expiry_date?.gt === undefined ||
        !areDatesEqual(queryResult.expiry_date.gt.expected, originalQuery.expiry_date.gt as Date))
    ) {
      console.warn("Expiry date gt does not match the original query")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        gt: {
          expected: originalQuery.expiry_date?.gt,
          received: queryResult.expiry_date.gt.expected,
          message: "Expiry date gt does not match the original query",
        },
      }
    }
    if (
      queryResult.expiry_date?.lte &&
      (originalQuery.expiry_date?.lte === undefined ||
        !areDatesEqual(queryResult.expiry_date.lte.expected, originalQuery.expiry_date.lte as Date))
    ) {
      console.warn("Expiry date lte does not match the original query")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        lte: {
          expected: originalQuery.expiry_date?.lte,
          received: queryResult.expiry_date.lte.expected,
          message: "Expiry date lte does not match the original query",
        },
      }
    }
    if (
      queryResult.expiry_date?.lt &&
      (originalQuery.expiry_date?.lt === undefined ||
        !areDatesEqual(queryResult.expiry_date.lt.expected, originalQuery.expiry_date.lt as Date))
    ) {
      console.warn("Expiry date lt does not match the original query")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        lt: {
          expected: originalQuery.expiry_date?.lt,
          received: queryResult.expiry_date.lt.expected,
          message: "Expiry date lt does not match the original query",
        },
      }
    }
    if (
      queryResult.expiry_date?.range &&
      (originalQuery.expiry_date?.range === undefined ||
        !areDatesEqual(
          queryResult.expiry_date.range.expected[0],
          originalQuery.expiry_date.range[0] as Date,
        ) ||
        !areDatesEqual(
          queryResult.expiry_date.range.expected[1],
          originalQuery.expiry_date.range[1] as Date,
        ))
    ) {
      console.warn("Expiry date range does not match the original query")
      isCorrect = false
      queryResultErrors.expiry_date = {
        ...queryResultErrors.expiry_date,
        range: {
          expected: originalQuery.expiry_date?.range,
          received: queryResult.expiry_date.range.expected,
          message: "Expiry date range does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkNationalityExclusionPublicInputs(
    originalQuery: Query,
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
    if (
      queryResult.nationality?.out &&
      (originalQuery.nationality?.out === undefined ||
        queryResult.nationality.out.expected?.length !==
          (originalQuery.nationality.out as string[]).length ||
        !queryResult.nationality.out.expected?.every((country) =>
          (originalQuery.nationality!.out as string[]).includes(country),
        ))
    ) {
      console.warn("Nationality exclusion list does not match the original query")
      isCorrect = false
      queryResultErrors.nationality = {
        ...queryResultErrors.nationality,
        out: {
          expected: originalQuery.nationality?.out as string[],
          received: queryResult.nationality.out.expected,
          message: "Nationality exclusion list does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkIssuingCountryExclusionPublicInputs(
    originalQuery: Query,
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
    if (
      queryResult.issuing_country?.out &&
      (originalQuery.issuing_country?.out === undefined ||
        queryResult.issuing_country.out.expected?.length !==
          (originalQuery.issuing_country.out as string[]).length ||
        !queryResult.issuing_country.out.expected?.every((country) =>
          (originalQuery.issuing_country!.out as string[]).includes(country),
        ))
    ) {
      console.warn("Issuing country exclusion list does not match the original query")
      isCorrect = false
      queryResultErrors.issuing_country = {
        ...queryResultErrors.issuing_country,
        out: {
          expected: originalQuery.issuing_country?.out as string[],
          received: queryResult.issuing_country.out.expected,
          message: "Issuing country exclusion list does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkNationalityInclusionPublicInputs(
    originalQuery: Query,
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
    if (
      queryResult.nationality?.in &&
      (originalQuery.nationality?.in === undefined ||
        queryResult.nationality.in.expected?.length !==
          (originalQuery.nationality.in as string[]).length ||
        !queryResult.nationality.in.expected?.every((country) =>
          (originalQuery.nationality!.in as string[]).includes(country),
        ))
    ) {
      console.warn("Nationality inclusion list does not match the original query")
      isCorrect = false
      queryResultErrors.nationality = {
        ...queryResultErrors.nationality,
        in: {
          expected: originalQuery.nationality?.in as string[],
          received: queryResult.nationality.in.expected,
          message: "Nationality inclusion list does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkIssuingCountryInclusionPublicInputs(
    originalQuery: Query,
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
    if (
      queryResult.issuing_country?.in &&
      (originalQuery.issuing_country?.in === undefined ||
        queryResult.issuing_country.in.expected?.length !==
          (originalQuery.issuing_country.in as string[]).length ||
        !queryResult.issuing_country.in.expected?.every((country) =>
          (originalQuery.issuing_country!.in as string[]).includes(country),
        ))
    ) {
      console.warn("Issuing country inclusion list does not match the original query")
      isCorrect = false
      queryResultErrors.issuing_country = {
        ...queryResultErrors.issuing_country,
        in: {
          expected: originalQuery.issuing_country?.in as string[],
          received: queryResult.issuing_country.in.expected,
          message: "Issuing country inclusion list does not match the original query",
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
    if (domain && getServiceScopeHash(domain) !== getServiceScopeFromDisclosureProof(proofData)) {
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
    if (scope && getScopeHash(scope) !== getServiceSubScopeFromDisclosureProof(proofData)) {
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
    devMode?: boolean,
  ) {
    let isCorrect = true
    try {
      const registryClient = new RegistryClient({ chainId: devMode ? 11155111 : 1 })
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

  public static async checkCircuitRegistryRoot(
    root: string,
    queryResultErrors: any,
    devMode?: boolean,
  ) {
    let isCorrect = true
    try {
      const registryClient = new RegistryClient({ chainId: devMode ? 11155111 : 1 })
      const isValid = await registryClient.isCircuitRootValid(root)
      if (!isValid) {
        console.warn("The proof uses unrecognized circuits")
        isCorrect = false
        if (!queryResultErrors.outer) queryResultErrors.outer = {}
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
      if (!queryResultErrors.outer) queryResultErrors.outer = {}
      queryResultErrors.outer.circuit = {
        expected: `A valid circuit from ZKPassport Registry`,
        received: `Got invalid circuit registry root: ${root}`,
        message: "The proof uses an unrecognized circuit",
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static checkBindPublicInputs(
    originalQuery: Query,
    queryResult: QueryResult,
    boundData: BoundData,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true

    if (queryResult.bind) {
      const bindMismatches: string[] = []
      if (
        queryResult.bind.user_address?.toLowerCase().replace("0x", "") !==
        boundData.user_address?.toLowerCase().replace("0x", "")
      ) {
        console.warn("Bound user address does not match the one from the query results")
        isCorrect = false
        bindMismatches.push(
          `user_address: expected ${queryResult.bind.user_address}, received ${boundData.user_address}`,
        )
      }
      if (queryResult.bind.chain !== boundData.chain) {
        console.warn("Bound chain id does not match the one from the query results")
        isCorrect = false
        bindMismatches.push(
          `chain: expected ${queryResult.bind.chain}, received ${boundData.chain}`,
        )
      }
      if (
        queryResult.bind.custom_data?.trim().toLowerCase() !==
        boundData.custom_data?.trim().toLowerCase()
      ) {
        console.warn("Bound custom data does not match the one from the query results")
        isCorrect = false
        bindMismatches.push(
          `custom_data: expected ${queryResult.bind.custom_data}, received ${boundData.custom_data}`,
        )
      }
      if (bindMismatches.length > 0) {
        queryResultErrors.bind = {
          ...queryResultErrors.bind,
          eq: {
            expected: `${queryResult.bind.user_address}, ${queryResult.bind.chain}, ${queryResult.bind.custom_data}`,
            received: `${boundData.user_address}, ${boundData.chain}, ${boundData.custom_data}`,
            message: `Bound data does not match: ${bindMismatches.join("; ")}`,
          },
        }
      }
    }
    if (
      queryResult.bind &&
      (originalQuery.bind === undefined ||
        queryResult.bind.user_address?.toLowerCase().replace("0x", "") !==
          originalQuery.bind.user_address?.toLowerCase().replace("0x", "") ||
        queryResult.bind.chain !== originalQuery.bind.chain ||
        queryResult.bind.custom_data?.trim().toLowerCase() !==
          originalQuery.bind.custom_data?.trim().toLowerCase())
    ) {
      console.warn("Bound data does not match the original query")
      isCorrect = false
      queryResultErrors.bind = {
        ...queryResultErrors.bind,
        eq: {
          expected: `${originalQuery.bind?.user_address}, ${originalQuery.bind?.chain}, ${originalQuery.bind?.custom_data}`,
          received: `${queryResult.bind.user_address}, ${queryResult.bind.chain}, ${queryResult.bind.custom_data}`,
          message: "Bound data does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkSanctionsExclusionPublicInputs(
    originalQuery: Query,
    queryResult: QueryResult,
    sanctionsCommittedInputs: SanctionsCommittedInputs,
    sanctionsBuilder: SanctionsBuilder,
  ) {
    const queryResultErrors: Partial<QueryResultErrors> = {}
    let isCorrect = true
    if (queryResult.sanctions && queryResult.sanctions.passed) {
      // For now it's fixed until we streamline the update of the sanctions registry
      const EXPECTED_ROOT = await sanctionsBuilder.getRoot()
      if (sanctionsCommittedInputs.rootHash !== EXPECTED_ROOT) {
        console.warn("Invalid sanctions registry root")
        isCorrect = false
        queryResultErrors.sanctions = {
          ...queryResultErrors.sanctions,
          eq: {
            expected: EXPECTED_ROOT,
            received: sanctionsCommittedInputs.rootHash,
            message: "Invalid sanctions registry root",
          },
        }
      }
      if (queryResult.sanctions.isStrict !== sanctionsCommittedInputs.isStrict) {
        console.warn("Invalid sanctions strict mode")
        isCorrect = false
        queryResultErrors.sanctions = {
          ...queryResultErrors.sanctions,
          eq: {
            expected: queryResult.sanctions.isStrict.toString(),
            received: sanctionsCommittedInputs.isStrict.toString(),
            message: "Invalid sanctions strict mode",
          },
        }
      }
    }
    if (
      queryResult.sanctions &&
      (originalQuery.sanctions === undefined ||
        queryResult.sanctions.isStrict !== (originalQuery.sanctions.strict ?? false))
    ) {
      console.warn("Sanctions config does not match the original query")
      isCorrect = false
      queryResultErrors.sanctions = {
        ...queryResultErrors.sanctions,
        eq: {
          expected: `strict: ${originalQuery.sanctions?.strict ?? false}`,
          received: `strict: ${queryResult.sanctions.isStrict}`,
          message: "Sanctions config does not match the original query",
        },
      }
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkFacematchPublicInputs(
    originalQuery: Query,
    queryResult: QueryResult,
    facematchCommittedInputs: FacematchCommittedInputs,
  ) {
    let isCorrect = true
    const queryResultErrors: Partial<QueryResultErrors> = {}
    if (queryResult.facematch && queryResult.facematch.passed) {
      // Check if the root key is either from Apple (iOS) or Google (Android)
      if (
        facematchCommittedInputs.rootKeyLeaf !== APPLE_APP_ATTEST_ROOT_KEY_HASH &&
        facematchCommittedInputs.rootKeyLeaf !== GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH &&
        facematchCommittedInputs.rootKeyLeaf !== GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH
      ) {
        console.warn("Invalid facematch root key hash")
        isCorrect = false
        queryResultErrors.facematch = {
          ...queryResultErrors.facematch,
          eq: {
            expected: `${APPLE_APP_ATTEST_ROOT_KEY_HASH} (iOS) or ${GOOGLE_APP_ATTEST_RSA_ROOT_KEY_HASH} (Android) or ${GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH} (Android)`,
            received: facematchCommittedInputs.rootKeyLeaf,
            message: "Invalid facematch root key hash",
          },
        }
      }
      const EXPECTED_ENVIRONMENT = "production"
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
        facematchCommittedInputs.appIdHash !== ZKPASSPORT_IOS_APP_ID_HASH &&
        facematchCommittedInputs.appIdHash !== ZKPASSPORT_ANDROID_APP_ID_HASH
      ) {
        console.warn(
          "Invalid facematch app id hash, the attestation should be coming from the ZKPassport app",
        )
        isCorrect = false
        queryResultErrors.facematch = {
          ...queryResultErrors.facematch,
          eq: {
            expected: `${ZKPASSPORT_IOS_APP_ID_HASH} (iOS) or ${ZKPASSPORT_ANDROID_APP_ID_HASH} (Android)`,
            received: facematchCommittedInputs.appIdHash,
            message:
              "Invalid facematch app id hash, the attestation should be coming from the ZKPassport app",
          },
        }
      }
      if (
        facematchCommittedInputs.mode !== queryResult.facematch?.mode ||
        facematchCommittedInputs.mode !== originalQuery.facematch?.mode
      ) {
        console.warn("Invalid facematch mode")
        isCorrect = false
        queryResultErrors.facematch = {
          ...queryResultErrors.facematch,
          eq: {
            expected: originalQuery.facematch?.mode,
            received: facematchCommittedInputs.mode,
            message: "Invalid facematch mode",
          },
        }
      }
    }
    return { isCorrect, queryResultErrors }
  }

  private static async checkCurrentDate(
    circuitName: keyof QueryResultErrors,
    proofData: ProofData,
    validity: number,
    queryResultErrors: Partial<QueryResultErrors>,
  ) {
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
    const currentDate = getCurrentDateFromDisclosureProof(proofData)
    const todayToCurrentDate = today.getTime() - currentDate.getTime()
    const expectedDifference = validity ? validity * 1000 : DEFAULT_VALIDITY * 1000
    let isCorrect = true
    if (todayToCurrentDate >= expectedDifference) {
      console.warn("The date used to check the validity of the ID falls out of the validity period")
      isCorrect = false
      if (!queryResultErrors[circuitName as keyof QueryResultErrors]) {
        queryResultErrors[circuitName as keyof QueryResultErrors] = {}
      }
      queryResultErrors[circuitName as keyof QueryResultErrors]!.date = {
        expected: `Difference: ${validity} seconds`,
        received: `Difference: ${Math.round(todayToCurrentDate / 1000)} seconds`,
        message: "The date used to check the validity of the ID falls out of the validity period",
      }
    }
    return { isCorrect, queryResultErrors }
  }

  // Enforce that every condition in `originalQuery` is actually backed by a proof
  private static checkQueryCompleteness(
    originalQuery: Query,
    committedInputKeys: Set<string>,
  ): { isCorrect: boolean; queryResultErrors: Partial<QueryResultErrors> } {
    let isCorrect = true
    const queryResultErrors: Partial<QueryResultErrors> = {}
    const has = (...keys: string[]) => keys.some((k) => committedInputKeys.has(k))
    const flag = (field: keyof QueryResultErrors, message: string) => {
      isCorrect = false
      queryResultErrors[field] = {
        ...queryResultErrors[field],
        commitment: {
          expected: "A proof covering the requested condition",
          received: "No matching proof was provided",
          message,
        },
      }
    }
    const hasDisclose = has("disclose_bytes", "disclose_bytes_evm")
    const isComparison = (c?: {
      gte?: unknown
      gt?: unknown
      lte?: unknown
      lt?: unknown
      range?: unknown
    }) =>
      !!c &&
      (c.gte !== undefined ||
        c.gt !== undefined ||
        c.lte !== undefined ||
        c.lt !== undefined ||
        c.range !== undefined)
    const isDisclosure = (c?: { eq?: unknown; disclose?: unknown }) =>
      !!c && (c.eq !== undefined || c.disclose === true)

    const age = originalQuery.age
    if ((isComparison(age) || age?.eq !== undefined) && !has("compare_age", "compare_age_evm")) {
      flag("age", "The proof does not verify the requested age condition")
    }

    if (
      isComparison(originalQuery.birthdate) &&
      !has("compare_birthdate", "compare_birthdate_evm")
    ) {
      flag("birthdate", "The proof does not verify the requested birthdate condition")
    }
    if (isDisclosure(originalQuery.birthdate) && !hasDisclose) {
      flag("birthdate", "The proof does not disclose the requested birthdate")
    }
    if (isComparison(originalQuery.expiry_date) && !has("compare_expiry", "compare_expiry_evm")) {
      flag("expiry_date", "The proof does not verify the requested expiry date condition")
    }
    if (isDisclosure(originalQuery.expiry_date) && !hasDisclose) {
      flag("expiry_date", "The proof does not disclose the requested expiry date")
    }

    const nationality = originalQuery.nationality
    if (
      nationality?.in !== undefined &&
      !has("inclusion_check_nationality", "inclusion_check_nationality_evm")
    ) {
      flag("nationality", "The proof does not verify the requested nationality inclusion")
    }
    if (
      nationality?.out !== undefined &&
      !has("exclusion_check_nationality", "exclusion_check_nationality_evm")
    ) {
      flag("nationality", "The proof does not verify the requested nationality exclusion")
    }
    if (isDisclosure(nationality) && !hasDisclose) {
      flag("nationality", "The proof does not disclose the requested nationality")
    }

    const issuingCountry = originalQuery.issuing_country
    if (
      issuingCountry?.in !== undefined &&
      !has("inclusion_check_issuing_country", "inclusion_check_issuing_country_evm")
    ) {
      flag("issuing_country", "The proof does not verify the requested issuing country inclusion")
    }
    if (
      issuingCountry?.out !== undefined &&
      !has("exclusion_check_issuing_country", "exclusion_check_issuing_country_evm")
    ) {
      flag("issuing_country", "The proof does not verify the requested issuing country exclusion")
    }
    if (isDisclosure(issuingCountry) && !hasDisclose) {
      flag("issuing_country", "The proof does not disclose the requested issuing country")
    }

    const discloseOnlyFields: Array<keyof QueryResultErrors> = [
      "firstname",
      "lastname",
      "fullname",
      "document_number",
      "document_type",
      "gender",
    ]
    for (const field of discloseOnlyFields) {
      if (
        isDisclosure((originalQuery as Record<string, unknown>)[field] as never) &&
        !hasDisclose
      ) {
        flag(field, `The proof does not disclose the requested ${field}`)
      }
    }

    if (originalQuery.bind && !has("bind", "bind_evm")) {
      flag("bind", "The proof does not verify the requested bound data")
    }

    if (
      originalQuery.sanctions &&
      !has("exclusion_check_sanctions", "exclusion_check_sanctions_evm")
    ) {
      flag("sanctions", "The proof does not verify the requested sanctions exclusion")
    }

    if (originalQuery.facematch && !has("facematch", "facematch_evm")) {
      flag("facematch", "The proof does not verify the requested FaceMatch")
    }

    if (!isCorrect) {
      console.warn("The proof does not verify all the requested conditions and information")
    }
    return { isCorrect, queryResultErrors }
  }

  public static async checkPublicInputs(
    domain: string,
    proofs: Array<ProofResult>,
    originalQuery: Query,
    queryResult: QueryResult,
    validity?: number,
    scope?: string,
    oprfKeyId?: string,
    devMode?: boolean,
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
          devMode,
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
        } = await this.checkCircuitRegistryRoot(
          circuitRegistryRoot.toString(16),
          queryResultErrors,
          devMode,
        )
        isCorrect = isCorrect && isCorrectCircuitRegistryRoot
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCircuitRegistryRoot,
        }

        const currentDate = getCurrentDateFromOuterProof(proofData)
        const todayToCurrentDate = today.getTime() - currentDate.getTime()
        const expectedDifference = validity ? validity * 1000 : DEFAULT_VALIDITY * 1000
        if (todayToCurrentDate >= expectedDifference) {
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
                ageCommittedInputs.minAge,
                ageCommittedInputs.maxAge,
              )
            : await getAgeParameterCommitment(ageCommittedInputs.minAge, ageCommittedInputs.maxAge)
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
            this.checkAgePublicInputs(proof, originalQuery, queryResult)
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
                birthdateCommittedInputs.minDateTimestamp,
                birthdateCommittedInputs.maxDateTimestamp,
                0,
              )
            : await getDateParameterCommitment(
                ProofType.BIRTHDATE,
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
            this.checkBirthdatePublicInputs(proof, originalQuery, queryResult)
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
                expiryCommittedInputs.minDateTimestamp,
                expiryCommittedInputs.maxDateTimestamp,
              )
            : await getDateParameterCommitment(
                ProofType.EXPIRY_DATE,
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
            this.checkExpiryDatePublicInputs(proof, originalQuery, queryResult)
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
            this.checkDiscloseBytesPublicInputs(proof, originalQuery, queryResult)
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
          } = this.checkNationalityInclusionPublicInputs(originalQuery, queryResult, countryList)
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
          } = this.checkIssuingCountryInclusionPublicInputs(originalQuery, queryResult, countryList)
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
          } = this.checkNationalityExclusionPublicInputs(originalQuery, queryResult, countryList)
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
          } = this.checkIssuingCountryExclusionPublicInputs(originalQuery, queryResult, countryList)
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
            this.checkBindPublicInputs(originalQuery, queryResult, bindCommittedInputs.data)
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
            ? await sanctionsBuilder.getSanctionsEvmParameterCommitment(
                exclusionCheckSanctionsCommittedInputs.isStrict,
              )
            : await sanctionsBuilder.getSanctionsParameterCommitment(
                exclusionCheckSanctionsCommittedInputs.isStrict,
              )
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
            originalQuery,
            queryResult,
            exclusionCheckSanctionsCommittedInputs,
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
                BigInt(facematchCommittedInputs.appIdHash),
                facematchCommittedInputs.mode === "regular" ? 1n : 2n,
              )
            : await getFacematchParameterCommitment(
                BigInt(facematchCommittedInputs.rootKeyLeaf),
                facematchCommittedInputs.environment === "development" ? 0n : 1n,
                BigInt(facematchCommittedInputs.appIdHash),
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
            await this.checkFacematchPublicInputs(
              originalQuery,
              queryResult,
              facematchCommittedInputs,
            )
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
          devMode,
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
          this.checkDiscloseBytesPublicInputs(proof, originalQuery, queryResult)
        isCorrect = isCorrect && isCorrectDisclose && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsDisclose,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "disclose",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
          this.checkAgePublicInputs(proof, originalQuery, queryResult)
        isCorrect = isCorrect && isCorrectAge && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsAge,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "age",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
          this.checkBirthdatePublicInputs(proof, originalQuery, queryResult)
        isCorrect = isCorrect && isCorrectBirthdate && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsBirthdate,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "birthdate",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
          this.checkExpiryDatePublicInputs(proof, originalQuery, queryResult)
        isCorrect = isCorrect && isCorrectExpiryDate && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsExpiryDate,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "expiry_date",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
        } = this.checkNationalityExclusionPublicInputs(originalQuery, queryResult, countryList)
        isCorrect = isCorrect && isCorrectNationalityExclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsNationalityExclusion,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "nationality",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
          queryResultErrors.issuing_country = {
            ...queryResultErrors.issuing_country,
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
            "issuing_country",
            scope,
          )
        const {
          isCorrect: isCorrectIssuingCountryExclusion,
          queryResultErrors: queryResultErrorsIssuingCountryExclusion,
        } = this.checkIssuingCountryExclusionPublicInputs(originalQuery, queryResult, countryList)
        isCorrect = isCorrect && isCorrectIssuingCountryExclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsIssuingCountryExclusion,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "issuing_country",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
        } = this.checkNationalityInclusionPublicInputs(originalQuery, queryResult, countryList)
        isCorrect = isCorrect && isCorrectNationalityInclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsNationalityInclusion,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "nationality",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
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
          queryResultErrors.issuing_country = {
            ...queryResultErrors.issuing_country,
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
            "issuing_country",
            scope,
          )
        const {
          isCorrect: isCorrectIssuingCountryInclusion,
          queryResultErrors: queryResultErrorsIssuingCountryInclusion,
        } = this.checkIssuingCountryInclusionPublicInputs(originalQuery, queryResult, countryList)
        isCorrect = isCorrect && isCorrectIssuingCountryInclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsIssuingCountryInclusion,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "issuing_country",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "bind") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn("Failed to check the link between the validity of the ID and the bound data")
          isCorrect = false
          queryResultErrors.bind = {
            ...queryResultErrors.bind,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message: "Failed to check the link between the validity of the ID and the bound data",
            },
          }
        }
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
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(domain, proofData, queryResultErrors, "bind", scope)
        const { isCorrect: isCorrectBind, queryResultErrors: queryResultErrorsBind } =
          this.checkBindPublicInputs(originalQuery, queryResult, bindCommittedInputs.data)
        isCorrect = isCorrect && isCorrectBind && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsBind,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "bind",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name === "exclusion_check_sanctions") {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the sanctions exclusion check",
          )
          isCorrect = false
          queryResultErrors.sanctions = {
            ...queryResultErrors.sanctions,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the sanctions exclusion check",
            },
          }
        }
        const sanctionsBuilder = await SanctionsBuilder.create()
        const exclusionCheckSanctionsCommittedInputs = proof.committedInputs
          ?.exclusion_check_sanctions as SanctionsCommittedInputs
        const calculatedParamCommitment = await sanctionsBuilder.getSanctionsParameterCommitment(
          exclusionCheckSanctionsCommittedInputs.isStrict,
        )
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
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "sanctions",
            scope,
          )
        const {
          isCorrect: isCorrectSanctionsExclusion,
          queryResultErrors: queryResultErrorsSanctionsExclusion,
        } = await this.checkSanctionsExclusionPublicInputs(
          originalQuery,
          queryResult,
          exclusionCheckSanctionsCommittedInputs,
          sanctionsBuilder,
        )
        isCorrect = isCorrect && isCorrectSanctionsExclusion && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsSanctionsExclusion,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "sanctions",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
        }
        uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      } else if (proof.name?.startsWith("facematch") && !proof.name?.endsWith("_evm")) {
        commitmentIn = getCommitmentInFromDisclosureProof(proofData)
        if (commitmentIn !== commitmentOut) {
          console.warn(
            "Failed to check the link between the validity of the ID and the facematch check",
          )
          isCorrect = false
          queryResultErrors.facematch = {
            ...queryResultErrors.facematch,
            commitment: {
              expected: `Commitment: ${commitmentOut}`,
              received: `Commitment: ${commitmentIn}`,
              message:
                "Failed to check the link between the validity of the ID and the facematch check",
            },
          }
        }
        const facematchCommittedInputs = proof.committedInputs
          ?.facematch as FacematchCommittedInputs
        const paramCommittment = getParameterCommitmentFromDisclosureProof(proofData)
        const calculatedParamCommitment = await getFacematchParameterCommitment(
          BigInt(facematchCommittedInputs.rootKeyLeaf),
          facematchCommittedInputs.environment === "development" ? 0n : 1n,
          BigInt(facematchCommittedInputs.appIdHash),
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
        const { isCorrect: isCorrectScope, queryResultErrors: queryResultErrorsScope } =
          this.checkScopeFromDisclosureProof(
            domain,
            proofData,
            queryResultErrors,
            "facematch",
            scope,
          )
        const { isCorrect: isCorrectFacematch, queryResultErrors: queryResultErrorsFacematch } =
          await this.checkFacematchPublicInputs(
            originalQuery,
            queryResult,
            facematchCommittedInputs,
          )
        isCorrect = isCorrect && isCorrectFacematch && isCorrectScope
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsFacematch,
          ...queryResultErrorsScope,
        }
        const { isCorrect: isCorrectCurrentDate, queryResultErrors: queryResultErrorsCurrentDate } =
          await this.checkCurrentDate(
            "facematch",
            proofData,
            validity ?? DEFAULT_VALIDITY,
            queryResultErrors,
          )
        isCorrect = isCorrect && isCorrectCurrentDate
        queryResultErrors = {
          ...queryResultErrors,
          ...queryResultErrorsCurrentDate,
        }
        // Don't use the nullifier from the proof for FaceMatch as it may be 0
        // but will always come with at least one other disclosure proof with a non-zero nullifier
        // uniqueIdentifier = getNullifierFromDisclosureProof(proofData).toString(10)
        // uniqueIdentifierType = getNullifierTypeFromDisclosureProof(proofData)
      }
    }

    const committedInputKeys = new Set<string>()
    for (const p of sortedProofs!) {
      for (const key of Object.keys(p.committedInputs ?? {})) committedInputKeys.add(key)
    }
    const { isCorrect: isQueryComplete, queryResultErrors: completenessErrors } =
      this.checkQueryCompleteness(originalQuery, committedInputKeys)
    isCorrect = isCorrect && isQueryComplete
    queryResultErrors = { ...queryResultErrors, ...completenessErrors }

    // Verify OPRF public key if the proof uses a salted nullifier
    if (
      isCorrect &&
      uniqueIdentifierType &&
      (uniqueIdentifierType === NullifierType.SALTED ||
        uniqueIdentifierType === NullifierType.SALTED_MOCK)
    ) {
      try {
        const oprfPk = await getOprfPublicKey(oprfKeyId ?? OPRF_DEFAULT_KEY_ID)
        const expectedPkHash = await hashOprfPublicKey(oprfPk)

        // Find a disclosure proof to extract oprfPkHash from
        const disclosureProof = sortedProofs.find(
          (p) =>
            p.name &&
            !p.name.startsWith("sig_check_") &&
            !p.name.startsWith("data_check_") &&
            !p.name.startsWith("outer") &&
            !p.name.startsWith("facematch"),
        )
        if (disclosureProof) {
          const dpData = getProofData(
            disclosureProof.proof as string,
            getNumberOfPublicInputs(disclosureProof.name!),
          )
          const proofPkHash = getOprfPkHashFromDisclosureProof(dpData)
          if (proofPkHash !== expectedPkHash) {
            console.warn("OPRF public key hash mismatch: proof uses an unknown OPRF key")
            isCorrect = false
          }
        }
      } catch (error) {
        console.warn("Failed to verify OPRF public key:", error)
        isCorrect = false
      }
    }

    return { isCorrect, uniqueIdentifier, uniqueIdentifierType, queryResultErrors }
  }
}
