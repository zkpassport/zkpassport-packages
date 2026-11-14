import { expect, test } from "bun:test"
import { describePhoneError } from "../src/verify/phone-errors"

test("recognises the reasons the app gives for not producing a proof", () => {
  const codes = [
    "This ID is not supported yet",
    "This service does not accept the way this ID was verified",
    "The user's device does not have enough memory to proceed",
    "Cannot generate proof for the age circuit. The conditions for this request are not met. Please check the query results to see which conditions are not met.",
    "Sanctions check failed",
  ].map((message) => describePhoneError(message, "Example")?.code)

  expect(codes).toEqual([
    "unsupported-id",
    "id-not-accepted",
    "device-unsupported",
    "requirements-not-met",
    "requirements-not-met",
  ])
})

test("names the service in what the user is told", () => {
  const error = describePhoneError("Cannot generate proof for the age circuit.", "Example")
  expect(error?.message).toBe("Your ID doesn’t meet what Example asks for.")
})

test("leaves a failure it does not recognise to be shown as it came", () => {
  expect(describePhoneError("Failed to generate outer proof: timeout", "Example")).toBeNull()
})
