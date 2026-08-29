import { describe, expect, it } from "vitest"
import {
  classifyControl,
  decideNextStep,
  fingerprintPage,
  StepTracker,
} from "./wizard"

describe("classifyControl", () => {
  it("recognizes the ordinary advance labels", () => {
    for (const label of ["Next", "Continue", "Save and Continue", "Save & Continue", "Proceed"]) {
      expect(classifyControl(label)).toBe("advance")
    }
  })

  it("recognizes the ordinary final labels", () => {
    for (const label of ["Submit", "Submit Application", "Send Application", "Apply Now", "Complete Application"]) {
      expect(classifyControl(label)).toBe("final")
    }
  })

  it("resolves an ambiguous label to final, never to advance", () => {
    // "Save and Submit" contains an advance word AND a final word. Reading it as
    // an advance would click Submit believing the form continues — the exact
    // failure the classifier exists to prevent.
    expect(classifyControl("Save and Submit")).toBe("final")
    expect(classifyControl("Continue to Submit")).toBe("final")
  })

  it("treats Review as an advance, because the review page still precedes Submit", () => {
    expect(classifyControl("Review")).toBe("advance")
    expect(classifyControl("Review your application")).toBe("advance")
  })

  it("classifies backwards and unrelated controls", () => {
    expect(classifyControl("Back")).toBe("back")
    expect(classifyControl("Previous")).toBe("back")
    expect(classifyControl("Add another")).toBe("other")
    expect(classifyControl("Upload résumé")).toBe("other")
    expect(classifyControl("")).toBe("other")
  })
})

describe("fingerprintPage", () => {
  it("is stable for the same page", () => {
    const a = fingerprintPage("https://acme.wd5.myworkdayjobs.com/apply", ["id:first", "id:last"])
    const b = fingerprintPage("https://acme.wd5.myworkdayjobs.com/apply", ["id:last", "id:first"])
    expect(a).toBe(b)
  })

  it("ignores tracking params and fragments that churn without the page changing", () => {
    const base = fingerprintPage("https://boards.greenhouse.io/acme/jobs/4012345", ["id:a"])
    expect(fingerprintPage("https://boards.greenhouse.io/acme/jobs/4012345?gh_src=x", ["id:a"])).toBe(base)
    expect(fingerprintPage("https://boards.greenhouse.io/acme/jobs/4012345#step-2", ["id:a"])).toBe(base)
    expect(fingerprintPage("https://boards.greenhouse.io/acme/jobs/4012345?t=99", ["id:a"])).toBe(base)
  })

  it("changes when the control set changes, even on the same URL", () => {
    // A single-page-app wizard swaps the whole form without navigating, so URL
    // alone cannot tell one step from the next.
    const step1 = fingerprintPage("https://x.com/apply", ["id:name", "id:email"])
    const step2 = fingerprintPage("https://x.com/apply", ["id:school", "id:degree"])
    expect(step1).not.toBe(step2)
  })

  it("survives a malformed URL rather than throwing", () => {
    expect(() => fingerprintPage("not a url", ["id:a"])).not.toThrow()
  })
})

describe("StepTracker", () => {
  it("records steps and reports where a fingerprint was first seen", () => {
    const t = new StepTracker(4)
    t.record({ fingerprint: "fp1", url: "u1", fieldCount: 5, filledCount: 5 })
    t.record({ fingerprint: "fp2", url: "u2", fieldCount: 3, filledCount: 2 })
    expect(t.count).toBe(2)
    expect(t.hasSeen("fp1")).toBe(true)
    expect(t.firstSeenAt("fp1")).toBe(1)
    expect(t.hasSeen("fp9")).toBe(false)
    expect(t.summary()).toBe("#1 5/5 fields → #2 2/3 fields")
  })

  it("reports exhaustion at the ceiling", () => {
    const t = new StepTracker(2)
    expect(t.exhausted).toBe(false)
    t.record({ fingerprint: "a", url: "", fieldCount: 0, filledCount: 0 })
    t.record({ fingerprint: "b", url: "", fieldCount: 0, filledCount: 0 })
    expect(t.exhausted).toBe(true)
  })
})

describe("decideNextStep", () => {
  const tracker = () => new StepTracker(8)

  it("submits when a final control is present", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "fp1",
      nextFingerprint: null,
      visibleControls: ["Back", "Submit Application"],
    })
    expect(d.action).toBe("submit")
    expect(d.reason).toBe("reached_final")
  })

  it("advances when only an advance control is present", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "fp1",
      nextFingerprint: null,
      visibleControls: ["Back", "Save and Continue"],
    })
    expect(d.action).toBe("advance")
    expect(d.detail).toContain("Save and Continue")
  })

  it("prefers submitting when both an advance and a final control are on the page", () => {
    // A review page offers both. The audit gate decides whether the form is
    // actually complete; the loop must not walk past the end of the wizard.
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "fp1",
      nextFingerprint: null,
      visibleControls: ["Continue", "Submit Application"],
    })
    expect(d.action).toBe("submit")
  })

  it("stops as stuck when the advance click did not change the page", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "fp1",
      nextFingerprint: "fp1",
      visibleControls: ["Next"],
    })
    expect(d.action).toBe("stop")
    expect(d.reason).toBe("stuck")
  })

  it("stops as a cycle when the wizard returns to an earlier page", () => {
    const t = tracker()
    t.record({ fingerprint: "fp1", url: "", fieldCount: 2, filledCount: 2 })
    t.record({ fingerprint: "fp2", url: "", fieldCount: 2, filledCount: 2 })
    const d = decideNextStep({
      tracker: t,
      currentFingerprint: "fp2",
      nextFingerprint: "fp1",
      visibleControls: ["Next"],
    })
    expect(d.action).toBe("stop")
    expect(d.reason).toBe("cycle")
    expect(d.detail).toContain("step 1")
  })

  it("stops at the step ceiling", () => {
    const t = new StepTracker(1)
    t.record({ fingerprint: "fp1", url: "", fieldCount: 1, filledCount: 1 })
    const d = decideNextStep({
      tracker: t,
      currentFingerprint: "fp2",
      nextFingerprint: null,
      visibleControls: ["Next"],
    })
    expect(d.action).toBe("stop")
    expect(d.reason).toBe("max_steps")
  })

  it("stops when there is nowhere to go", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "fp1",
      nextFingerprint: null,
      visibleControls: ["Back", "Add another"],
    })
    expect(d.action).toBe("stop")
    expect(d.reason).toBe("no_advance")
  })

  it("checks stuck before the step ceiling, so the cause reported is the real one", () => {
    const t = new StepTracker(1)
    t.record({ fingerprint: "fp1", url: "", fieldCount: 1, filledCount: 1 })
    const d = decideNextStep({
      tracker: t,
      currentFingerprint: "fp1",
      nextFingerprint: "fp1",
      visibleControls: ["Next"],
    })
    expect(d.reason).toBe("stuck")
  })
})

describe("decideNextStep at the step ceiling", () => {
  it("still submits when the final control is present", () => {
    // The ceiling exists to stop us advancing forever, not to discard a
    // finished application. A wizard that used every allowed step and then
    // presented Submit has done exactly what it was meant to.
    const t = new StepTracker(1)
    t.record({ fingerprint: "fp1", url: "", fieldCount: 3, filledCount: 3 })
    const d = decideNextStep({
      tracker: t,
      currentFingerprint: "fp1",
      nextFingerprint: null,
      visibleControls: ["Submit Application"],
    })
    expect(d.action).toBe("submit")
  })

  it("refuses to advance past the ceiling when there is no final control", () => {
    const t = new StepTracker(1)
    t.record({ fingerprint: "fp1", url: "", fieldCount: 3, filledCount: 3 })
    const d = decideNextStep({
      tracker: t,
      currentFingerprint: "fp1",
      nextFingerprint: null,
      visibleControls: ["Next"],
    })
    expect(d.action).toBe("stop")
    expect(d.reason).toBe("max_steps")
  })
})

describe("disabled controls — the greyed-out Submit", () => {
  const tracker = () => new StepTracker(8)

  it("reports a disabled Submit as an incomplete form, not a missing button", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "a.b.1",
      nextFingerprint: null,
      visibleControls: [],
      allControls: [{ label: "Submit Application", disabled: true }],
    })
    expect(d.action).toBe("stop")
    expect(d.reason).toBe("blocked_final")
    expect(d.detail).toMatch(/disabled/i)
    expect(d.detail).toMatch(/incomplete/i)
  })

  it("reports a disabled Next the same way", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "a.b.1",
      nextFingerprint: null,
      visibleControls: [],
      allControls: [{ label: "Next", disabled: true }],
    })
    expect(d.reason).toBe("blocked_final")
  })

  it("still submits when the final control is enabled", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "a.b.1",
      nextFingerprint: null,
      visibleControls: ["Submit Application"],
      allControls: [{ label: "Submit Application", disabled: false }],
    })
    expect(d.action).toBe("submit")
  })

  it("prefers an enabled advance over a disabled final", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "a.b.1",
      nextFingerprint: null,
      visibleControls: ["Next"],
      allControls: [
        { label: "Next", disabled: false },
        { label: "Submit Application", disabled: true },
      ],
    })
    expect(d.action).toBe("advance")
  })

  it("falls back to no_advance when the page genuinely has nothing", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "a.b.1",
      nextFingerprint: null,
      visibleControls: [],
      allControls: [{ label: "Back", disabled: false }],
    })
    expect(d.reason).toBe("no_advance")
  })

  it("behaves exactly as before when allControls is not supplied", () => {
    const d = decideNextStep({
      tracker: tracker(),
      currentFingerprint: "a.b.1",
      nextFingerprint: null,
      visibleControls: [],
    })
    expect(d.reason).toBe("no_advance")
  })
})
