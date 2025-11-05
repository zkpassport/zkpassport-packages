import { getOffsetInArray } from "@/utils"
import { PassportViewModel } from ".."

export function getFirstNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  const lastNameStartIndex = isIDCard ? 60 : 5
  const firstNameStartIndex = getOffsetInArray(mrz.split(""), ["<", "<"], lastNameStartIndex) + 2
  const firstNameEndIndex = getOffsetInArray(mrz.split(""), ["<"], firstNameStartIndex)
  // Subtract 2 from the start index to include the two angle brackets
  return [firstNameStartIndex - 2, firstNameEndIndex]
}

export function getSecondNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const secondNameStartIndex = getFirstNameRange(passport)[1] + 1
  const secondNameEndIndex = getOffsetInArray(mrz.split(""), ["<"], secondNameStartIndex)
  // Subtract 1 from the start index to include the two angle brackets
  return [secondNameStartIndex - 1, secondNameEndIndex]
}

export function getThirdNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const thirdNameStartIndex = getSecondNameRange(passport)[1] + 1
  const thirdNameEndIndex = getOffsetInArray(mrz.split(""), ["<"], thirdNameStartIndex)
  // Subtract 1 from the start index to include the two angle brackets
  return [thirdNameStartIndex - 1, thirdNameEndIndex]
}

export function getLastNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  const lastNameStartIndex = isIDCard ? 60 : 5
  const lastNameEndIndex = getOffsetInArray(mrz.split(""), ["<", "<"], lastNameStartIndex)
  // Add 2 to the end index to include the two angle brackets
  return [lastNameStartIndex, lastNameEndIndex + 2]
}

export function getFullNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 60 : 5, isIDCard ? 90 : 44]
}

export function getBirthdateRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 30 : 57, isIDCard ? 36 : 63]
}

export function getDocumentNumberRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 5 : 44, isIDCard ? 14 : 53]
}

export function getNationalityRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 45 : 54, isIDCard ? 48 : 57]
}

export function getNationality(passport: PassportViewModel): string {
  const mrz = passport?.mrz
  const countryCode = mrz.slice(...getNationalityRange(passport))
  if (countryCode === "D<<") {
    return "DEU"
  }
  return countryCode
}

export function getExpiryDateRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 38 : 65, isIDCard ? 44 : 71]
}

export function getGenderRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 37 : 64, isIDCard ? 38 : 65]
}
