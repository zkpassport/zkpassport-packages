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