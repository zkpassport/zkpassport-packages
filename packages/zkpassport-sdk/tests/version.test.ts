import pkg from "../package.json"
import { VERSION } from "../src/index"

describe("SDK version", () => {
  it("is exported publicly and matches package.json version", () => {
    expect(VERSION).toBe(pkg.version)
  })
})
