import { PASSPORTS } from "../../../tests/fixtures/passports"
import { getNameCombinations, processName } from "./sanctions"

describe("Sanctions", () => {
  test("should get the correct name combinations for passport", () => {
    const passport = PASSPORTS.john
    const nameCombinations = getNameCombinations(passport)
    expect(nameCombinations).toEqual([
      "SMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<",
    ])

    const passport2 = {
      ...passport,
      mrz: "P<ZKRSMITH<<JOHN<MILLER<PETERSON<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    }
    const nameCombinations2 = getNameCombinations(passport2)
    expect(nameCombinations2).toEqual([
      "SMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<MILLER<PETERSON<<<<<<<<<<<<",
    ])

    const passport3 = {
      ...passport,
      mrz: "P<ZKRSMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    }
    const nameCombinations3 = getNameCombinations(passport3)
    expect(nameCombinations3).toEqual([
      "SMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
    ])

    const passportFull = {
      ...passport,
      mrz: "P<ZKRSMITH<<JOHN<MILLER<PETERSON<THE<THIRD<EZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    }
    const nameCombinationsFull = getNameCombinations(passportFull)
    expect(nameCombinationsFull).toEqual([
      "SMITH<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<",
      "SMITH<<JOHN<MILLER<PETERSON<<<<<<<<<<<<",
    ])

    const passportLongName = {
      ...passport,
      mrz: "P<ZKRSMITH<<SUPERCALIFRAGILISTIC<EXPIALIDOCIZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    }
    const nameCombinationsLongName = getNameCombinations(passportLongName)
    expect(nameCombinationsLongName).toEqual([
      "SMITH<<SUPERCALIFRAGILISTIC<<<<<<<<<<<<",
      "SMITH<<SUPERCALIFRAGILISTIC<EXPIALIDOCI",
      "SMITH<<SUPERCALIFRAGILISTIC<EXPIALIDOCI",
    ])

    const passportLongFirstName = {
      ...passport,
      mrz: "P<ZKRSMITH<<SUPERCALIFRAGILISTICEXPIALIDOCIOZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    }
    const nameCombinationsLongFirstName = getNameCombinations(passportLongFirstName)
    expect(nameCombinationsLongFirstName).toEqual([
      "SMITH<<SUPERCALIFRAGILISTICEXPIALIDOCIO",
      "SMITH<<SUPERCALIFRAGILISTICEXPIALIDOCIO",
      "SMITH<<SUPERCALIFRAGILISTICEXPIALIDOCIO",
    ])
  })

  test("should get the correct name combinations for ID cards", () => {
    const passport = PASSPORTS.john

    const idCard = {
      ...passport,
      mrz: "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<",
    }
    const nameCombinations = getNameCombinations(idCard)
    expect(nameCombinations).toEqual([
      "DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
    ])

    const idCard2 = {
      ...passport,
      mrz: "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<JOHN<MILLER<<<<<<<<<<<<<<",
    }
    const nameCombinations2 = getNameCombinations(idCard2)
    expect(nameCombinations2).toEqual([
      "DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<",
    ])

    const idCard3 = {
      ...passport,
      mrz: "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<JOHN<MILLER<PETERSON<<<<<",
    }
    const nameCombinations3 = getNameCombinations(idCard3)
    expect(nameCombinations3).toEqual([
      "DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<MILLER<PETERSON<<<<<<<<<<<<<<",
    ])

    const idCard4 = {
      ...passport,
      mrz: "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<JOHN<MILLER<PETERSON<PHIL",
    }
    const nameCombinations4 = getNameCombinations(idCard4)
    expect(nameCombinations4).toEqual([
      "DOE<<JOHN<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<",
      "DOE<<JOHN<MILLER<PETERSON<<<<<<<<<<<<<<",
    ])

    const idCardLongName = {
      ...passport,
      mrz: "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<SUPERCALIFRAGILISTIC<EXPI",
    }
    const nameCombinationsLongName = getNameCombinations(idCardLongName)
    expect(nameCombinationsLongName).toEqual([
      "DOE<<SUPERCALIFRAGILISTIC<<<<<<<<<<<<<<",
      "DOE<<SUPERCALIFRAGILISTIC<EXPI<<<<<<<<<",
      "DOE<<SUPERCALIFRAGILISTIC<EXPI<<<<<<<<<",
    ])

    const idCardLongFirstName = {
      ...passport,
      mrz: "I<ZKRZID222222<<<<<<<<<<<<<<<<9801157F3001018ZKR<<<<<<<<<<<2DOE<<SUPERCALIFRAGILISTICEXPIA",
    }
    const nameCombinationsLongFirstName = getNameCombinations(idCardLongFirstName)
    expect(nameCombinationsLongFirstName).toEqual([
      "DOE<<SUPERCALIFRAGILISTICEXPIA<<<<<<<<<",
      "DOE<<SUPERCALIFRAGILISTICEXPIA<<<<<<<<<",
      "DOE<<SUPERCALIFRAGILISTICEXPIA<<<<<<<<<",
    ])
  })

  test("should process the name correctly", () => {
    expect(processName("DOE<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<<")).toEqual(
      "DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<",
    )
    expect(processName("DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<")).toEqual(
      "DOE<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<<<",
    )
  })
})
