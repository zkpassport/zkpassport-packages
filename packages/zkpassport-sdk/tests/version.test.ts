// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pkg from "../package.json"
import { VERSION } from "../src/constants"

describe("SDK version", () => {
  it("constants.VERSION matches package.json version", () => {
    expect(VERSION).toBe(pkg.version)
  })
})
