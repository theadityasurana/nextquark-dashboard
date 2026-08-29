import { describe, expect, it } from "vitest"
import {
  APPLY_PATH_SUFFIX,
  ASHBY_TYPE_MAP,
  CLIENT_SIDE_VALIDATION_ONLY,
  classifyAtsType,
  DEFAULT_OPTION_SELECTOR,
  GREENHOUSE_TYPE_MAP,
  isClickDriven,
  isSkippable,
  optionSelectorFor,
} from "./ats-fields"

describe("Greenhouse type map", () => {
  it("covers every documented job board field type", () => {
    // From developers.greenhouse.io — these are the only types the API emits.
    expect(Object.keys(GREENHOUSE_TYPE_MAP).sort()).toEqual([
      "input_file",
      "input_hidden",
      "input_text",
      "multi_value_multi_select",
      "multi_value_single_select",
      "textarea",
    ])
  })

  it("maps select types apart from each other", () => {
    expect(classifyAtsType("Greenhouse", "multi_value_single_select")).toBe("select")
    expect(classifyAtsType("Greenhouse", "multi_value_multi_select")).toBe("multiselect")
  })

  it("marks hidden inputs skippable so we never write to them", () => {
    expect(classifyAtsType("Greenhouse", "input_hidden")).toBe("hidden")
    expect(isSkippable("hidden")).toBe(true)
  })

  it("maps the résumé field to file", () => {
    expect(classifyAtsType("Greenhouse", "input_file")).toBe("file")
  })
})

describe("Ashby type map", () => {
  it("covers every documented field type", () => {
    expect(Object.keys(ASHBY_TYPE_MAP).sort()).toEqual([
      "Boolean",
      "Date",
      "Email",
      "File",
      "LongText",
      "MultiValueSelect",
      "Number",
      "Phone",
      "Score",
      "SocialLink",
      "String",
      "ValueSelect",
    ])
  })

  it("maps the types that previously had no handler", () => {
    // These four are exactly what failed on the OpenAI/Ashby form.
    expect(classifyAtsType("Ashby", "Date")).toBe("date")
    expect(classifyAtsType("Ashby", "Boolean")).toBe("checkbox")
    expect(classifyAtsType("Ashby", "ValueSelect")).toBe("select")
    expect(classifyAtsType("Ashby", "MultiValueSelect")).toBe("multiselect")
  })

  it("maps SocialLink to url, not plain text", () => {
    expect(classifyAtsType("Ashby", "SocialLink")).toBe("url")
  })
})

describe("classifyAtsType fallback", () => {
  it("falls back to name-shape matching for providers with no type enum", () => {
    expect(classifyAtsType("Lever", "multiple-select")).toBe("multiselect")
    expect(classifyAtsType("Lever", "dropdown")).toBe("select")
    expect(classifyAtsType("Lever", "yes-no")).toBe("radio")
    expect(classifyAtsType("iCIMS", "textarea")).toBe("longtext")
    expect(classifyAtsType("Jobvite", "attachment")).toBe("file")
  })

  it("defaults to text for anything unrecognized", () => {
    expect(classifyAtsType("Greenhouse", "brand_new_type")).toBe("text")
    expect(classifyAtsType(null, "")).toBe("text")
  })
})

describe("optionSelectorFor", () => {
  it("includes Workday's promptOption, which carries no role=option", () => {
    // The single most important selector detail: a role-only query returns zero
    // options on Workday and the dropdown looks empty.
    expect(optionSelectorFor("Workday")).toContain("promptOption")
  })

  it("always includes role=option", () => {
    for (const portal of ["Workday", "Greenhouse", "Ashby", "Lever", "iCIMS", null]) {
      expect(optionSelectorFor(portal)).toContain('[role="option"]')
    }
  })

  it("falls back for an unknown portal", () => {
    expect(optionSelectorFor("SomethingElse")).toBe(DEFAULT_OPTION_SELECTOR)
  })
})

describe("apply path suffixes", () => {
  it("knows the providers whose form lives at a separate URL", () => {
    // Landing on the posting page gives a form with zero fields, which audits
    // as "all required fields filled" — a false success.
    expect(APPLY_PATH_SUFFIX.Ashby).toBe("/application")
    expect(APPLY_PATH_SUFFIX.Lever).toBe("/apply")
  })
})

describe("client-side validation", () => {
  it("flags Greenhouse, which does not server-validate required fields", () => {
    // Documented: the job board API "will not confirm the inclusion of required
    // fields" — our pre-submit audit is the only gate.
    expect(CLIENT_SIDE_VALIDATION_ONLY.has("Greenhouse")).toBe(true)
  })
})

describe("isClickDriven", () => {
  it("identifies the kinds that need a click rather than typing", () => {
    for (const k of ["checkbox", "consent", "radio", "select", "multiselect"] as const) {
      expect(isClickDriven(k)).toBe(true)
    }
  })

  it("excludes the typed kinds", () => {
    for (const k of ["text", "longtext", "email", "phone", "url", "number", "date"] as const) {
      expect(isClickDriven(k)).toBe(false)
    }
  })
})
