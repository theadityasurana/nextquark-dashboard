import { describe, expect, it } from "vitest"
import {
  isInteractiveRole,
  kindForRole,
  mergeAxFields,
  needsVisionFallback,
  type RawAxNode,
} from "./ax-scan"

const node = (over: Partial<RawAxNode> = {}): RawAxNode => ({
  mmid: "42",
  role: "radiogroup",
  name: "Are you legally authorized to work?",
  required: true,
  ...over,
})

describe("kindForRole", () => {
  it("maps ARIA roles onto the handler vocabulary", () => {
    expect(kindForRole("checkbox", false)).toBe("checkbox")
    expect(kindForRole("switch", false)).toBe("checkbox")
    expect(kindForRole("radiogroup", false)).toBe("radio")
    expect(kindForRole("listbox", false)).toBe("select")
    expect(kindForRole("textbox", false)).toBe("text")
  })

  it("treats a combobox with no known options as a typeahead", () => {
    // The distinction decides which handler drives it: a native-select strategy
    // on an async combobox reports success while the field stays empty.
    expect(kindForRole("combobox", false)).toBe("typeahead")
    expect(kindForRole("combobox", true)).toBe("select")
  })
})

describe("isInteractiveRole", () => {
  it("accepts fillable roles and rejects structural ones", () => {
    expect(isInteractiveRole("textbox")).toBe(true)
    expect(isInteractiveRole("radiogroup")).toBe(true)
    expect(isInteractiveRole("heading")).toBe(false)
    expect(isInteractiveRole("listitem")).toBe(false)
    expect(isInteractiveRole("paragraph")).toBe(false)
  })
})

describe("mergeAxFields", () => {
  it("returns fields the DOM scan missed", () => {
    const merged = mergeAxFields([node()], [{ label: "First name" }])
    expect(merged).toHaveLength(1)
    expect(merged[0].key).toBe("ax:42")
    expect(merged[0].kind).toBe("radio")
    expect(merged[0].required).toBe(true)
  })

  it("drops anything the DOM scan already found, matching on label", () => {
    // The two scans identify controls differently by construction — DOM by
    // id/name, AX by an injected ordinal — so label is the only shared identity.
    const merged = mergeAxFields([node({ name: "First Name *" })], [{ label: "First name" }])
    expect(merged).toHaveLength(0)
  })

  it("de-duplicates within its own results", () => {
    const merged = mergeAxFields([node({ mmid: "1" }), node({ mmid: "2" })], [])
    expect(merged).toHaveLength(1)
  })

  it("skips disabled, hidden, unnamed, and non-interactive nodes", () => {
    const merged = mergeAxFields(
      [
        node({ mmid: "1", disabled: true }),
        node({ mmid: "2", hidden: true }),
        node({ mmid: "3", name: "" }),
        node({ mmid: "4", role: "heading", name: "Application" }),
      ],
      []
    )
    expect(merged).toHaveLength(0)
  })

  it("carries value and checked state through", () => {
    const merged = mergeAxFields([node({ role: "checkbox", name: "I agree", checked: true, value: "on" })], [])
    expect(merged[0].checked).toBe(true)
    expect(merged[0].value).toBe("on")
  })

  it("strips required-marker asterisks from the label", () => {
    const merged = mergeAxFields([node({ name: "Email *" })], [])
    expect(merged[0].label).toBe("Email")
  })
})

describe("needsVisionFallback", () => {
  it("does not pay for vision when DOM and AX already explain the form", () => {
    expect(needsVisionFallback(12, 3, 6)).toBe(false)
  })

  it("falls back when nothing was found at all", () => {
    expect(needsVisionFallback(0, 0, 0)).toBe(true)
  })

  it("falls back on a tiny form with no required field anywhere", () => {
    // Almost every real application marks at least one field required; a form
    // that marks none is likely hiding its semantics behind custom markup.
    expect(needsVisionFallback(3, 0, 0)).toBe(true)
  })

  it("does not fall back on a large form that simply marks nothing required", () => {
    expect(needsVisionFallback(20, 0, 0)).toBe(false)
  })
})
