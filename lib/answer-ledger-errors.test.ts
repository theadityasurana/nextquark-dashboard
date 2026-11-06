import { describe, it, expect } from "vitest"
import { AnswerLedger, fieldsNamedInErrors } from "./answer-ledger"

const BANNER = "Your form needs correctionsMissing entry for required field: Where are you currently located?"

describe("fieldsNamedInErrors", () => {
  it("reads the field out of Ashby's banner", () => {
    expect(fieldsNamedInErrors([BANNER])).toEqual(["Where are you currently located?"])
  })

  it("separates several named fields", () => {
    expect(fieldsNamedInErrors(["Missing entry for required field: School Missing entry for required field: Degree"])).toEqual(["School", "Degree"])
  })

  it("keeps a plain label as it is", () => {
    expect(fieldsNamedInErrors(["Resume/CV"])).toEqual(["Resume/CV"])
  })
})

describe("reopening a rejected field", () => {
  const label = "Where are you currently located?"

  it("reopens the field and forgets a pick the form refused", () => {
    const ledger = new AnswerLedger()
    ledger.record("k", label, "Decline to self-identify", "model-choice")
    ledger.settle("k")
    expect(ledger.unsettleFromErrors(fieldsNamedInErrors([BANNER]))).toEqual(["k"])
    expect(ledger.isSettled("k")).toBe(false)
    expect(ledger.get("k", label)).toBeUndefined()
  })
})
