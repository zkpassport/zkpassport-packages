import fs from "fs"
import path from "path"
import { ultraVkToFields } from "../src/circuits/vkey"

describe("ultraVkToFields", () => {
  test("outer_evm_count_6_vkey", () => {
    const fixturesDir = path.join(__dirname, "fixtures", "outer_evm_count_6_vkey")
    const vkey = fs.readFileSync(path.join(fixturesDir, "vk"))
    const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, "vk_fields.json"), "utf8"))
    const vkeyAsFields = ultraVkToFields(vkey)
    expect(vkeyAsFields).toEqual(expected)
  })

  test("outer_count_6_vkey", () => {
    const fixturesDir = path.join(__dirname, "fixtures", "outer_count_6_vkey")
    const vkey = fs.readFileSync(path.join(fixturesDir, "vk"))
    const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, "vk_fields.json"), "utf8"))
    const vkeyAsFields = ultraVkToFields(vkey)
    expect(vkeyAsFields).toEqual(expected)
  })

  test("compare_age_vkey", () => {
    const fixturesDir = path.join(__dirname, "fixtures", "compare_age_vkey")
    const vkey = fs.readFileSync(path.join(fixturesDir, "vk"))
    const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, "vk_fields.json"), "utf8"))
    const vkeyAsFields = ultraVkToFields(vkey)
    expect(vkeyAsFields).toEqual(expected)
  })

  test("compare_age_evm_vkey", () => {
    const fixturesDir = path.join(__dirname, "fixtures", "compare_age_evm_vkey")
    const vkey = fs.readFileSync(path.join(fixturesDir, "vk"))
    const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, "vk_fields.json"), "utf8"))
    const vkeyAsFields = ultraVkToFields(vkey)
    expect(vkeyAsFields).toEqual(expected)
  })
})
