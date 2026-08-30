import { describe, expect, it } from "vitest"
import {
  buildHandlerProgram,
  HANDLERS,
  selectHandler,
  type ElementDescriptor,
} from "./index"

const el = (over: Partial<ElementDescriptor> = {}): ElementDescriptor => ({
  tag: "input",
  type: "text",
  role: null,
  id: null,
  name: null,
  className: null,
  autocomplete: null,
  placeholder: null,
  ariaLabel: null,
  ariaAutocomplete: null,
  ariaHasPopup: null,
  ariaControls: null,
  dataAutomationId: null,
  multiple: false,
  label: null,
  inDateContainer: false,
  ...over,
})

describe("registry", () => {
  it("is sorted by priority, specific before generic", () => {
    const priorities = HANDLERS.map((h) => h.priority)
    expect(priorities).toEqual([...priorities].sort((a, b) => a - b))
    // The catch-all must be last or it swallows everything.
    expect(HANDLERS[HANDLERS.length - 1].name).toBe("text")
  })

  it("has unique handler names", () => {
    const names = HANDLERS.map((h) => h.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe("selectHandler", () => {
  it("routes native checkboxes and ARIA checkboxes", () => {
    expect(selectHandler(el({ type: "checkbox" }))?.name).toBe("checkbox")
    expect(selectHandler(el({ type: null, role: "checkbox" }))?.name).toBe("checkbox")
    expect(selectHandler(el({ type: null, role: "switch" }))?.name).toBe("checkbox")
  })

  it("routes radios, including Workday's ARIA radios", () => {
    expect(selectHandler(el({ type: "radio" }))?.name).toBe("radio")
    expect(selectHandler(el({ type: null, role: "radio" }))?.name).toBe("radio")
    expect(selectHandler(el({ tag: "fieldset", type: null }))?.name).toBe("radio")
  })

  it("routes native selects", () => {
    expect(selectHandler(el({ tag: "select", type: null }))?.name).toBe("dropdown")
    expect(selectHandler(el({ tag: "select", type: null, multiple: true }))?.name).toBe("dropdown")
  })

  it("routes date inputs and calendar widgets", () => {
    expect(selectHandler(el({ type: "date" }))?.name).toBe("date")
    expect(selectHandler(el({ type: "month" }))?.name).toBe("date")
    expect(selectHandler(el({ inDateContainer: true }))?.name).toBe("date")
    expect(selectHandler(el({ className: "react-datepicker__input" }))?.name).toBe("date")
  })

  it("routes typeahead comboboxes", () => {
    expect(selectHandler(el({ role: "combobox" }))?.name).toBe("typeahead")
    expect(selectHandler(el({ ariaAutocomplete: "list" }))?.name).toBe("typeahead")
    expect(selectHandler(el({ className: "select__input" }))?.name).toBe("typeahead")
  })

  it("falls back to text for ordinary inputs and textareas", () => {
    expect(selectHandler(el())?.name).toBe("text")
    expect(selectHandler(el({ type: "email" }))?.name).toBe("text")
    expect(selectHandler(el({ tag: "textarea", type: null }))?.name).toBe("text")
  })

  it("refuses hidden and file inputs", () => {
    // Writing to a hidden input is never correct; résumé has its own path.
    expect(selectHandler(el({ type: "hidden" }))).toBeNull()
    expect(selectHandler(el({ type: "file" }))).toBeNull()
  })

  it("prefers the specific handler when a control matches several", () => {
    // A checkbox never falls through to text.
    expect(selectHandler(el({ type: "checkbox", className: "select__input" }))?.name).toBe("checkbox")
  })

  // ─── Superseded: a picker in a date block is a picker ───
  //
  // This used to assert the opposite — that a combobox inside a date container is
  // a DATE picker (40) before it is a typeahead (50). Greenhouse's education row
  // is exactly that shape: "Start date month" and "Start date year" are
  // react-selects sitting in a date container. The date handler claimed both and
  // failed them six times in a single run with date-unhandled, while the correct
  // values ("September", "2020") waited to be selected.
  //
  // Only a native date input is a date. Everything else is driven by whatever can
  // actually open it.
  it("hands a combobox in a date container to the typeahead handler", () => {
    expect(selectHandler(el({ role: "combobox", inDateContainer: true }))?.name).toBe("typeahead")
    expect(selectHandler(el({ tag: "select", inDateContainer: true }))?.name).toBe("dropdown")
  })

  it("still routes a native date input to the date handler", () => {
    expect(selectHandler(el({ type: "date" }))?.name).toBe("date")
    expect(selectHandler(el({ type: "month" }))?.name).toBe("date")
    // A plain text input in a date block is still the datepicker's own field.
    expect(selectHandler(el({ type: "text", inDateContainer: true }))?.name).toBe("date")
  })

  it("returns null for a control nothing can drive", () => {
    expect(selectHandler(el({ tag: "div", type: null }))).toBeNull()
  })
})

describe("buildHandlerProgram", () => {
  const ctx = {
    fieldKey: "id:q1",
    label: "Test",
    value: "Yes",
    optionSelector: '[role="option"]',
    targetAttr: "data-nq-field",
  }

  it("includes the shared prelude and the handler body", () => {
    const handler = selectHandler(el({ type: "checkbox" }))!
    const program = buildHandlerProgram(handler, ctx)
    expect(program).toContain("function readState")
    expect(program).toContain("function clickVia")
    expect(program).toContain("already-checked")
  })

  // The bug this pins: playwright.execute runs its code in Node, where `document`
  // and `window` do not exist. Without this hop every handler threw a
  // ReferenceError before doing any work, and the throw surfaced as the
  // indistinguishable reason "unknown".
  it("runs the handler in the browser, not in Node", () => {
    for (const d of [el({ type: "checkbox" }), el({ role: "combobox" }), el({ type: "radio" }), el()]) {
      const program = buildHandlerProgram(selectHandler(d)!, ctx)
      expect(program).toContain("return await page.evaluate(async () => {")
      // The DOM access must sit INSIDE the evaluate callback.
      expect(program.indexOf("page.evaluate")).toBeLessThan(program.indexOf("document"))
    }
  })

  // ─── The escape that silently ate every letter "s" ───
  //
  // These handler bodies are TS template literals, so a regex written /\s+/ in
  // the source emits /s+/ into the browser: `\s` is not a recognised escape and
  // collapses to a bare `s`. The option reader then replaced every "s" in every
  // label — "Yes" became "Ye", "United States +1" became "United State  +1" —
  // and the matcher picked "British Indian Ocean Territory" as the best fit for
  // "India". Nothing throws; the widget just gets the wrong answer.
  it("emits whitespace regexes that match whitespace, not the letter s", () => {
    for (const d of [{ role: "combobox" }, { type: "checkbox" }, { type: "radio" }, {}]) {
      const program = buildHandlerProgram(selectHandler(el(d as any))!, ctx)
      for (const m of program.matchAll(/replace\(\/([^/\n]{1,12})\/[gimsuy]*/g)) {
        expect(m[1], `collapsed escape /${m[1]}/ in ${program.slice(0, 0)}`).not.toMatch(/^s\+?$/)
      }
    }
  })

  it("wraps the body so await and early return both work", () => {
    const handler = selectHandler(el())!
    const program = buildHandlerProgram(handler, ctx)
    expect(program).toContain("await (async () => {")
    expect(program).toMatch(/return \{ \.\.\.result, handler:/)
  })

  it("interpolates the value as a JSON literal, not raw", () => {
    const handler = selectHandler(el())!
    const program = buildHandlerProgram(handler, { ...ctx, value: 'He said "hi"' })
    // Unescaped interpolation here would produce a syntax error in the VM.
    expect(program).toContain('"He said \\"hi\\""')
  })

  it("passes the portal-specific option selector through", () => {
    const handler = selectHandler(el({ role: "combobox" }))!
    const program = buildHandlerProgram(handler, {
      ...ctx,
      optionSelector: '[role="option"], [data-automation-id="promptOption"]',
    })
    expect(program).toContain("promptOption")
  })

  it("every handler produces a syntactically valid program", () => {
    for (const handler of HANDLERS) {
      const program = buildHandlerProgram(handler, ctx)
      // Compiles as an async function body without throwing a SyntaxError.
      expect(() => new Function(`return (async () => { ${program} })`)).not.toThrow()
    }
  })
})

describe("grouped inputs and pickers", () => {
  const d = (over: Partial<ElementDescriptor> = {}): ElementDescriptor => ({
    tag: "input", type: null, role: null, id: null, name: null, className: null,
    autocomplete: null, placeholder: null, ariaLabel: null, ariaAutocomplete: null,
    ariaHasPopup: null, ariaControls: null, dataAutomationId: null, multiple: false,
    label: null, inDateContainer: false, ...over,
  })

  it("routes a checkbox GROUP to its own handler, not the single-checkbox one", () => {
    // Sixteen boxes sharing a name are one "select all that apply" question;
    // driving them individually ticked every option on the form.
    expect(selectHandler(d({ type: "checkbox", role: "nq-checkboxgroup" }))?.name).toBe("checkboxgroup")
  })

  it("still routes a lone checkbox to the checkbox handler", () => {
    expect(selectHandler(d({ type: "checkbox" }))?.name).toBe("checkbox")
  })

  it("routes a Yes/No button pair to the button-group handler", () => {
    expect(selectHandler(d({ tag: "div", role: "nq-buttongroup" }))?.name).toBe("buttongroup")
  })

  it("prefers the typeahead handler for a combobox, never the text handler", () => {
    // A picker must be opened and its suggestion clicked; typing into it leaves
    // free text the portal never offered.
    expect(selectHandler(d({ role: "combobox", ariaAutocomplete: "list" }))?.name).toBe("typeahead")
  })
})
