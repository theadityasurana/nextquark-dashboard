import { describe, expect, it } from "vitest"
import { isHoneypot, type HoneypotDescriptor } from "./honeypot"

const field = (over: Partial<HoneypotDescriptor> = {}): HoneypotDescriptor => ({
  name: "first_name",
  id: "first_name",
  className: "input",
  type: "text",
  tabIndex: null,
  autocomplete: "given-name",
  ariaHidden: false,
  rect: { width: 240, height: 38, top: 320, left: 120 },
  ancestorRect: { width: 600, height: 80 },
  clipped: false,
  hiddenOverflowAncestor: false,
  labelText: "first name",
  opacity: 1,
  ...over,
})

describe("isHoneypot", () => {
  it("passes an ordinary visible field", () => {
    expect(isHoneypot(field()).isHoneypot).toBe(false)
  })

  it("catches bait names and ids", () => {
    expect(isHoneypot(field({ name: "honeypot" })).isHoneypot).toBe(true)
    expect(isHoneypot(field({ name: "user_leave_blank_field" })).isHoneypot).toBe(true)
    expect(isHoneypot(field({ name: null, id: "spam-trap" })).isHoneypot).toBe(true)
  })

  it("does not catch legitimate fields whose names merely contain a bait substring", () => {
    // "company_url" and "website" are real application fields. Skipping them
    // would leave a required input unfilled at the submit gate.
    expect(isHoneypot(field({ name: "company_url" })).isHoneypot).toBe(false)
    expect(isHoneypot(field({ name: "website" })).isHoneypot).toBe(false)
    expect(isHoneypot(field({ name: "phone_field" })).isHoneypot).toBe(false)
  })

  it("catches a field positioned off-canvas despite a normal size", () => {
    // The existing visibility test passes this: the rect has real width and
    // height, and nothing is display:none.
    const v = isHoneypot(field({ rect: { width: 240, height: 38, top: 320, left: -9999 } }))
    expect(v.isHoneypot).toBe(true)
    expect(v.reason).toContain("off-canvas")
  })

  it("catches a clipped field and a zero-size overflow wrapper", () => {
    expect(isHoneypot(field({ clipped: true })).isHoneypot).toBe(true)
    expect(isHoneypot(field({ hiddenOverflowAncestor: true })).isHoneypot).toBe(true)
  })

  it("catches near-transparent fields that the opacity !== '0' check misses", () => {
    expect(isHoneypot(field({ opacity: 0.01 })).isHoneypot).toBe(true)
    expect(isHoneypot(field({ opacity: 0.9 })).isHoneypot).toBe(false)
  })

  it("catches an instruction to leave the field blank", () => {
    expect(isHoneypot(field({ labelText: "leave this field blank" })).isHoneypot).toBe(true)
    expect(isHoneypot(field({ labelText: "if you are human, leave empty" })).isHoneypot).toBe(true)
  })

  it("only treats tabindex=-1 as a signal alongside no label and autocomplete off", () => {
    // tabindex=-1 alone is legitimate on managed widgets like comboboxes.
    expect(isHoneypot(field({ tabIndex: -1 })).isHoneypot).toBe(false)
    expect(isHoneypot(field({ tabIndex: -1, autocomplete: "off" })).isHoneypot).toBe(false)
    expect(isHoneypot(field({ tabIndex: -1, autocomplete: "off", labelText: null })).isHoneypot).toBe(true)
  })

  it("never flags a submit, button, or hidden control", () => {
    expect(isHoneypot(field({ type: "hidden", name: "honeypot" })).isHoneypot).toBe(false)
    expect(isHoneypot(field({ type: "submit", opacity: 0 })).isHoneypot).toBe(false)
  })

  it("gives a reason whenever it flags something", () => {
    const v = isHoneypot(field({ name: "honeypot" }))
    expect(v.reason).toBeTruthy()
  })
})
