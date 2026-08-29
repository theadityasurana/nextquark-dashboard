import { describe, expect, it } from "vitest"
import {
  buildCodeModePrompt,
  MAX_CODE_CHARS,
  parseCodeReply,
  screenCode,
  verifyNoSideEffects,
} from "./code-mode"

describe("screenCode", () => {
  it("allows an ordinary field driver", () => {
    const code = `
      el.focus();
      el.value = 'Bengaluru';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { filled: true };
    `
    expect(screenCode(code).allowed).toBe(true)
  })

  it("refuses anything that could submit the form", () => {
    // The invariant this whole guard exists to protect: only clickSubmitButton
    // submits, and only after the audit gate.
    for (const bad of [
      "el.form.submit();",
      "el.closest('form').requestSubmit();",
      "document.querySelector('[type=\"submit\"]').click();",
      "document.querySelector('button.apply-now').click();",
      "document.querySelector('#applyNow').click();",
      "el.closest('form').querySelector('.send-application').click();",
    ]) {
      const v = screenCode(bad)
      expect(v.allowed).toBe(false)
      expect(v.reason).toBeTruthy()
    }
  })

  it("refuses navigation", () => {
    expect(screenCode("window.location.href = '/next';").allowed).toBe(false)
    expect(screenCode("location = 'https://x.com';").allowed).toBe(false)
    expect(screenCode("window.open('https://x.com');").allowed).toBe(false)
    expect(screenCode("history.pushState({}, '', '/x');").allowed).toBe(false)
  })

  it("refuses network access", () => {
    expect(screenCode("await fetch('https://evil.example');").allowed).toBe(false)
    expect(screenCode("new XMLHttpRequest().open('GET', '/x');").allowed).toBe(false)
    expect(screenCode("navigator.sendBeacon('/x', 'y');").allowed).toBe(false)
  })

  it("refuses dynamically built code, which would defeat the screen itself", () => {
    expect(screenCode("eval('el.value = 1');").allowed).toBe(false)
    expect(screenCode("new Function('return 1')();").allowed).toBe(false)
    expect(screenCode("await import('./x.js');").allowed).toBe(false)
  })

  it("refuses reads of storage and cookies", () => {
    expect(screenCode("const c = document.cookie;").allowed).toBe(false)
    expect(screenCode("localStorage.getItem('token');").allowed).toBe(false)
  })

  it("refuses unbounded loops", () => {
    expect(screenCode("while (true) { el.click(); }").allowed).toBe(false)
    expect(screenCode("for (;;) { el.click(); }").allowed).toBe(false)
  })

  it("refuses an empty or oversized program", () => {
    expect(screenCode("").allowed).toBe(false)
    expect(screenCode("   ").allowed).toBe(false)
    // Padded with real characters, not whitespace: the screen trims first.
    expect(screenCode("el.value = 'x';" + "a".repeat(MAX_CODE_CHARS)).allowed).toBe(false)
  })

  it("names the rule that rejected it, so a false positive is diagnosable", () => {
    expect(screenCode("await fetch('/x')").reason).toMatch(/network/i)
    expect(screenCode("el.form.submit()").reason).toMatch(/submit/i)
  })
})

describe("parseCodeReply", () => {
  it("takes the body out of a fenced block", () => {
    const out = parseCodeReply("Here you go:\n```javascript\nel.value = 'x'; return { filled: true };\n```")
    expect(out).toContain("el.value")
    expect(out).not.toContain("```")
  })

  it("accepts a bare program", () => {
    expect(parseCodeReply("el.click(); return { filled: true };")).toContain("el.click()")
  })

  it("refuses prose, so an explanation is never executed", () => {
    expect(parseCodeReply("I could not work out how to fill this field")).toBeNull()
    expect(parseCodeReply("Sorry, the element is not visible so nothing can be done")).toBeNull()
  })

  it("refuses a program that never touches the element it was given", () => {
    expect(parseCodeReply("document.querySelector('input').value = 'x';")).toBeNull()
  })

  it("handles empty input", () => {
    expect(parseCodeReply(null)).toBeNull()
    expect(parseCodeReply("")).toBeNull()
  })
})

describe("verifyNoSideEffects", () => {
  const mark = (over: Partial<{ url: string; formCount: number; fieldCount: number }> = {}) => ({
    url: "https://boards.greenhouse.io/acme/jobs/1",
    formCount: 1,
    fieldCount: 12,
    ...over,
  })

  it("passes when the page is where we left it", () => {
    expect(verifyNoSideEffects(mark(), mark({ fieldCount: 12 })).clean).toBe(true)
  })

  it("catches a navigation", () => {
    const v = verifyNoSideEffects(mark(), mark({ url: "https://boards.greenhouse.io/acme/confirmation" }))
    expect(v.clean).toBe(false)
    expect(v.reason).toMatch(/navigated/i)
  })

  it("catches a vanished form — the signature of an accidental submit", () => {
    const v = verifyNoSideEffects(mark(), mark({ formCount: 0, fieldCount: 0 }))
    expect(v.clean).toBe(false)
    expect(v.reason).toMatch(/submit/i)
  })

  it("catches most fields disappearing even when the form element survives", () => {
    // React-rendered ATSes swap the contents without removing the <form>.
    const v = verifyNoSideEffects(mark({ fieldCount: 12 }), mark({ fieldCount: 2 }))
    expect(v.clean).toBe(false)
    expect(v.reason).toMatch(/lost most of its fields/i)
  })

  it("tolerates a small field-count change from a revealed follow-up question", () => {
    expect(verifyNoSideEffects(mark({ fieldCount: 12 }), mark({ fieldCount: 13 })).clean).toBe(true)
    expect(verifyNoSideEffects(mark({ fieldCount: 12 }), mark({ fieldCount: 10 })).clean).toBe(true)
  })

  it("does not flag a small form shrinking, where the ratio rule would be noise", () => {
    expect(verifyNoSideEffects(mark({ fieldCount: 2 }), mark({ fieldCount: 1 })).clean).toBe(true)
  })
})

describe("buildCodeModePrompt", () => {
  it("gives the model the failure reason and the markup", () => {
    const p = buildCodeModePrompt({
      label: "Rate your SQL ability",
      value: "Advanced",
      kind: "unknown",
      failureReason: "no-matching-option",
      html: "<div class='rating'></div>",
    })
    expect(p).toContain("Rate your SQL ability")
    expect(p).toContain("Advanced")
    expect(p).toContain("no-matching-option")
    expect(p).toContain("<div class='rating'>")
  })

  it("states the constraints the screen enforces", () => {
    const p = buildCodeModePrompt({ label: "x", value: "y", kind: "text", failureReason: "z", html: "" })
    expect(p).toMatch(/never click.*submit/i)
    expect(p).toMatch(/never navigate/i)
    expect(p).toMatch(/never call fetch/i)
  })

  it("truncates enormous markup", () => {
    const p = buildCodeModePrompt({ label: "x", value: "y", kind: "text", failureReason: "z", html: "<div>".repeat(5000) })
    expect(p.length).toBeLessThan(6000)
  })
})
