import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import { signMockPassports } from "./generate-mock-passports"

const sodsDir = path.join(import.meta.dirname, "../src/mock-passports/sods")

describe("signMockPassports", () => {
  test("reproduces the committed SODs", async () => {
    const sods = await signMockPassports()

    expect(sods).toHaveLength(10)
    for (const { file, contents } of sods) {
      expect(contents).toBe(readFileSync(path.join(sodsDir, file), "utf-8"))
    }
  })
})
