import { describe, it, expect } from "vitest"
import { isAnswerButtonLabel, isOptionNotice, VM_DOM_HELPERS } from "./vm-dom"

// ─── The button-group scanner, pinned to real forms ───
//
// nqFindButtonGroups runs inside page.evaluate, so it cannot be imported here.
// Its one genuinely subtle decision — "is this button an answer, or is it the
// widget's own furniture?" — is exported instead, and interpolated into the VM
// source, so this file tests the same rule the browser runs.
//
// Every string below was taken from a live run's logs, not invented.

describe("isAnswerButtonLabel — Greenhouse combobox chrome", () => {
  // The exact pair Greenhouse renders for Location (City), Veteran Status and
  // Disability Status. Two clickable things, zero answers — which is how they
  // passed the `buttons.length >= 2` check and got claimed as button groups.
  // "Toggle flyout" was then handed to the model as the value to select.
  it("rejects the combobox chrome that made every Greenhouse select look like a button group", () => {
    expect(isAnswerButtonLabel("Clear selections")).toBe(false)
    expect(isAnswerButtonLabel("Toggle flyout")).toBe(false)
    expect(isAnswerButtonLabel("Locate me")).toBe(false)
  })

  it("still rejects plain actions", () => {
    for (const t of ["Upload File", "Add another", "Remove", "Cancel", "Submit Application", "Browse"]) {
      expect([t, isAnswerButtonLabel(t)]).toEqual([t, false])
    }
  })
})

describe("isAnswerButtonLabel — real answers must survive", () => {
  // Ashby's work-authorisation / sponsorship / office-attendance questions.
  // These are the three REQUIRED fields the whole button-group path exists for.
  it("accepts a Yes/No pair", () => {
    expect(isAnswerButtonLabel("Yes")).toBe(true)
    expect(isAnswerButtonLabel("No")).toBe(true)
  })

  // Straight from a SpaceX run's `offered:` list.
  it("accepts Greenhouse option text", () => {
    for (const t of [
      "Not applicable/Do not recall",
      "4.0 out of 4.0",
      "1600 out of 1600",
      "Careers site",
      "Glassdoor",
      "Did not take/Do not recall",
    ]) {
      expect([t, isAnswerButtonLabel(t)]).toEqual([t, true])
    }
  })

  // The chrome regexes are anchored and word-bounded so they cannot eat an
  // answer that merely starts with the same letters.
  it("does not reject an answer that happens to begin with a chrome word", () => {
    expect(isAnswerButtonLabel("Clearance held")).toBe(true)
    expect(isAnswerButtonLabel("Openness to relocation")).toBe(true)
    expect(isAnswerButtonLabel("Searching for a new role")).toBe(true)
  })

  it("rejects empty text and prose too long to be an option", () => {
    expect(isAnswerButtonLabel("")).toBe(false)
    expect(isAnswerButtonLabel("   ")).toBe(false)
    expect(isAnswerButtonLabel("x".repeat(41))).toBe(false)
  })
})

describe("VM_DOM_HELPERS", () => {
  // No test here for the stray-backtick build break that has bitten twice:
  // lib/vm-dom.ts is one big template literal, so an UNESCAPED backtick fails
  // to compile and tsc catches it before any test runs, while an ESCAPED one is
  // legitimate and does appear in the emitted string. There is nothing left to
  // assert at runtime.

  // The interpolation above must emit real regex literals, not "[object Object]".
  it("interpolates the button predicates as regex literals", () => {
    expect(VM_DOM_HELPERS).toContain("/^(clear|toggle|locate")
    expect(VM_DOM_HELPERS).toContain("/^(upload|add|remove")
    expect(VM_DOM_HELPERS).not.toContain("[object Object]")
  })
})

// ─── The "No options" row that got submitted as an answer ───
//
// Graviton (Greenhouse), 2026-09-01: Degree and School/University Name were
// both driven to the string "No options", the audit read them empty, the submit
// gate trusted the handler anyway, and the portal rejected the application with
// eight validation errors.
describe("isOptionNotice", () => {
  it("rejects react-select's empty and loading notices", () => {
    for (const t of [
      "No options", "no options", "No Options Found", "No results",
      "No results found", "No matches", "Nothing found", "Loading...",
      "Loading…", "Searching...", "Type to search", "Start typing…", "",
    ]) {
      expect([t, isOptionNotice(t)]).toEqual([t, true])
    }
  })

  it("rejects a notice by class even when its text reads like an answer", () => {
    expect(isOptionNotice("None", "select__menu-notice--no-options")).toBe(true)
  })

  it("keeps every genuine option", () => {
    for (const t of [
      "No", "Yes", "None", "B.Tech", "Dual", "IIT Delhi", "IIT Bombay",
      "No options for relocation", "No prior experience", "Not applicable",
      "Bachelor's Degree", "No, I do not require sponsorship",
    ]) {
      expect([t, isOptionNotice(t)]).toEqual([t, false])
    }
  })

  it("does not treat an ordinary option class as furniture", () => {
    expect(isOptionNotice("IIT Delhi", "select__option select__option--is-focused")).toBe(false)
  })
})

// ─── Shadow DOM ───
//
// SmartRecruiters (Avery Dennison), 2026-09-01: a real browser reported ONE
// control in the light DOM on a fully rendered application form. The other
// fifteen — every required one among them — sat inside `spl-*` web components,
// behind 1,814 open shadow roots that document.querySelectorAll cannot cross.
// Three earlier runs read that inventory as "the form never renders".
//
// The suite runs on `environment: "node"`, so there is no DOM to test against
// and adding one is a dependency this cannot justify. The helpers are pure tree
// walking, though, so a stub implementing exactly the surface they touch pins
// the semantics that actually broke: descending THROUGH a host, stepping OUT of
// a root via `.host`, and scoping an id lookup to the root that owns it.
type StubEl = {
  tag: string
  attrs: Record<string, string>
  children: StubEl[]
  parentElement: StubEl | null
  parentNode: any
  shadowRoot: any
  nodeType: number
  matches(sel: string): boolean
  querySelector(sel: string): StubEl | null
  querySelectorAll(sel: string): StubEl[]
  getRootNode(): any
}

/** Selectors are limited to what the helpers under test actually pass: "*", a tag, or #id. */
function makeTree() {
  const mk = (tag: string, attrs: Record<string, string> = {}): StubEl => {
    const el: any = {
      tag, attrs, children: [], parentElement: null, parentNode: null,
      shadowRoot: null, nodeType: 1,
      matches: (sel: string) =>
        sel === "*" || sel === tag || (sel.startsWith("#") && attrs.id === sel.slice(1)),
      querySelector: (sel: string) => el.querySelectorAll(sel)[0] ?? null,
      querySelectorAll: (sel: string) => {
        const out: StubEl[] = []
        const walk = (n: any) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c) } }
        walk(el)
        return out
      },
      getRootNode: () => {
        let n: any = el
        while (n.parentElement || (n.parentNode && !n.parentNode.host)) n = n.parentElement ?? n.parentNode
        return n.parentNode?.host ? n.parentNode : root
      },
    }
    return el
  }
  const attach = (parent: any, child: StubEl) => {
    parent.children.push(child); child.parentElement = parent.nodeType === 1 ? parent : null; child.parentNode = parent
  }
  const mkRoot = (host: StubEl) => {
    const r: any = {
      host, children: [], nodeType: 11,
      querySelector: (sel: string) => r.querySelectorAll(sel)[0] ?? null,
      querySelectorAll: (sel: string) => {
        const out: StubEl[] = []
        const walk = (n: any) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c) } }
        walk(r)
        return out
      },
    }
    host.shadowRoot = r
    return r
  }

  // document > spl-input(#shadow: div > input#first-name-input) — the exact
  // shape the live probe found, with the label inside the same shadow root.
  const root: any = {
    children: [], nodeType: 9,
    querySelector: (sel: string) => root.querySelectorAll(sel)[0] ?? null,
    querySelectorAll: (sel: string) => {
      const out: StubEl[] = []
      const walk = (n: any) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c) } }
      walk(root)
      return out
    },
  }
  const form = mk("form")
  attach(root, form)
  const lightInput = mk("input", { id: "light" })
  attach(form, lightInput)

  const host = mk("spl-input")
  attach(form, host)
  const shadow = mkRoot(host)
  const wrap = mk("div")
  attach(shadow, wrap)
  const deepInput = mk("input", { id: "first-name-input" })
  attach(wrap, deepInput)
  const deepLabel = mk("label", { for: "first-name-input" })
  attach(wrap, deepLabel)

  return { root, form, host, shadow, lightInput, deepInput, deepLabel }
}

function helpers(doc: any) {
  const fn = new Function(
    "document", "window", "getComputedStyle",
    VM_DOM_HELPERS + "\nreturn { nqDeepAll, nqDeepOne, nqUp, nqClosest, nqRootOf };"
  )
  return fn(doc, { CSS: { escape: (s: string) => s } }, () => ({}))
}

describe("VM_DOM_HELPERS — shadow piercing", () => {
  it("finds controls the light DOM cannot see", () => {
    const t = makeTree()
    const h = helpers(t.root)
    // What the old code did — and why three runs reported an empty form.
    expect(t.root.querySelectorAll("input")).toHaveLength(1)
    expect(h.nqDeepAll("input")).toHaveLength(2)
    expect(h.nqDeepAll("input")).toContain(t.deepInput)
  })

  it("returns each element once even though roots are walked twice over", () => {
    const t = makeTree()
    const h = helpers(t.root)
    const ids = h.nqDeepAll("input").map((e: any) => e.attrs.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("walks out of a shadow root through its host", () => {
    const t = makeTree()
    const h = helpers(t.root)
    // parentElement alone stops at the root boundary — this is the step that
    // made every wrapper/label walk terminate inside the component.
    expect(t.deepInput.parentElement?.parentElement).toBe(null)
    expect(h.nqUp(h.nqUp(t.deepInput))).toBe(t.host)
    expect(h.nqClosest(t.deepInput, "form")).toBe(t.form)
  })

  it("scopes an id lookup to the root that owns it", () => {
    const t = makeTree()
    const h = helpers(t.root)
    // The label names the field, but only from inside the shadow root: the id
    // is not addressable from the document at all.
    expect(t.root.querySelector("#first-name-input")).toBe(null)
    expect(h.nqRootOf(t.deepInput)).toBe(t.shadow)
    expect(h.nqRootOf(t.deepInput).querySelector("label")).toBe(t.deepLabel)
    expect(h.nqRootOf(t.lightInput)).toBe(t.root)
  })

  it("still finds light-DOM controls, and prefers a direct hit", () => {
    const t = makeTree()
    const h = helpers(t.root)
    expect(h.nqDeepOne("input")).toBe(t.lightInput)
    expect(h.nqDeepOne("input", t.shadow)).toBe(t.deepInput)
  })
})
