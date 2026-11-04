import { describe, expect, test } from "bun:test"
import { stringToAsciiStringArray } from "@/utils"
import {
  documentNumberAndNationalityLeafPreimage,
  nameAndDobLeafPreimage,
  nameAndYobLeafPreimage,
  nameLeafPreimage,
} from "./leaves"

const NAME = "SMITH<<JOHN".padEnd(39, "<")

describe("sanctions leaf preimages", () => {
  test("lay out the four families as name, name‖YYMMDD, name‖YY and docNo‖nationality", () => {
    const name = stringToAsciiStringArray(NAME)
    const dob = stringToAsciiStringArray("880112")
    expect(nameLeafPreimage(name)).toEqual(name)
    expect(nameAndDobLeafPreimage(name, dob)).toEqual([...name, ...dob])
    expect(nameAndYobLeafPreimage(name, dob.slice(0, 2))).toEqual([
      ...name,
      ...stringToAsciiStringArray("88"),
    ])
    expect(
      documentNumberAndNationalityLeafPreimage(
        stringToAsciiStringArray("L898902C3"),
        stringToAsciiStringArray("UTO"),
      ),
    ).toEqual(stringToAsciiStringArray("L898902C3UTO"))
  })

  test("keep the caller's representation", () => {
    const name = Array.from(NAME, (c) => BigInt(c.charCodeAt(0)))
    expect(nameLeafPreimage(name)[0]).toBe(BigInt("S".charCodeAt(0)))
  })

  test("reject fields of the wrong MRZ length", () => {
    const name = stringToAsciiStringArray(NAME)
    expect(() => nameLeafPreimage(name.slice(1))).toThrow("name must be 39 bytes")
    expect(() => nameAndDobLeafPreimage(name, stringToAsciiStringArray("1988"))).toThrow(
      "date of birth must be 6 bytes",
    )
    expect(() => nameAndYobLeafPreimage(name, stringToAsciiStringArray("1988"))).toThrow(
      "year of birth must be 2 bytes",
    )
    expect(() =>
      documentNumberAndNationalityLeafPreimage(
        stringToAsciiStringArray("L898902C3"),
        stringToAsciiStringArray("UT"),
      ),
    ).toThrow("nationality must be 3 bytes")
  })
})
