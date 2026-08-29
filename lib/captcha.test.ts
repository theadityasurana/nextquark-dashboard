import { describe, expect, it } from "vitest"
import {
  buildInjectCode,
  buildTaskPayload,
  CAPTCHA_DETECT_CODE,
  extractToken,
  isSolvable,
  TASK_TYPES,
  type CaptchaDetection,
} from "./captcha"

describe("CAPTCHA_DETECT_CODE", () => {
  it("tests hCaptcha before reCAPTCHA", () => {
    // hCaptcha containers also carry data-sitekey. Checking reCAPTCHA first
    // would misreport every hCaptcha and submit it with the wrong task type.
    const hIndex = CAPTCHA_DETECT_CODE.indexOf("h-captcha")
    const rIndex = CAPTCHA_DETECT_CODE.indexOf("g-recaptcha")
    expect(hIndex).toBeGreaterThan(-1)
    expect(rIndex).toBeGreaterThan(-1)
    expect(hIndex).toBeLessThan(rIndex)
  })

  it("looks for the invisible families keyword detection can never see", () => {
    expect(CAPTCHA_DETECT_CODE).toContain("challenges.cloudflare.com")
    expect(CAPTCHA_DETECT_CODE).toContain("render=")
    expect(CAPTCHA_DETECT_CODE).toContain("recaptchav3")
  })
})

describe("isSolvable", () => {
  it("accepts the five real families", () => {
    for (const type of Object.keys(TASK_TYPES)) {
      expect(isSolvable({ type } as CaptchaDetection)).toBe(true)
    }
  })

  it("rejects a not-yet-rendered Turnstile and a null detection", () => {
    expect(isSolvable({ type: "turnstile_script_only" } as CaptchaDetection)).toBe(false)
    expect(isSolvable(null)).toBe(false)
  })
})

describe("buildTaskPayload", () => {
  it("uses the proxyless task type for the detected family", () => {
    const p = buildTaskPayload("key", { type: "hcaptcha", sitekey: "sk", url: "https://x.com" }) as any
    expect(p.clientKey).toBe("key")
    expect(p.task.type).toBe("HCaptchaTaskProxyLess")
    expect(p.task.websiteKey).toBe("sk")
  })

  it("supplies a pageAction for reCAPTCHA v3, which mints tokens per action", () => {
    const p = buildTaskPayload("key", { type: "recaptchav3", sitekey: "sk", url: "https://x.com" }) as any
    expect(p.task.pageAction).toBe("submit")
    const withAction = buildTaskPayload("key", { type: "recaptchav3", sitekey: "sk", url: "https://x.com", action: "login" }) as any
    expect(withAction.task.pageAction).toBe("login")
  })

  it("passes Turnstile metadata through only when it exists", () => {
    const bare = buildTaskPayload("k", { type: "turnstile", sitekey: "s", url: "u" }) as any
    expect(bare.task.metadata).toBeUndefined()
    const full = buildTaskPayload("k", { type: "turnstile", sitekey: "s", url: "u", action: "a", cdata: "c" }) as any
    expect(full.task.metadata).toEqual({ action: "a", cdata: "c" })
  })
})

describe("extractToken", () => {
  it("reads the family-specific solution field", () => {
    expect(extractToken("turnstile", { token: "T" })).toBe("T")
    expect(extractToken("recaptchav2", { gRecaptchaResponse: "R" })).toBe("R")
    expect(extractToken("hcaptcha", { gRecaptchaResponse: "H" })).toBe("H")
  })

  it("returns null when there is no solution", () => {
    expect(extractToken("hcaptcha", undefined)).toBeNull()
    expect(extractToken("hcaptcha", {})).toBeNull()
  })
})

describe("buildInjectCode", () => {
  it("fires the site's own callback for reCAPTCHA, not just the response field", () => {
    // Setting the textarea alone leaves the page believing the widget is
    // unsolved; the callback has to run.
    const code = buildInjectCode("recaptchav2", "TOKEN")
    expect(code).toContain("g-recaptcha-response")
    expect(code).toContain("___grecaptcha_cfg")
  })

  it("bounds the callback walk so a cyclic object graph cannot hang the page", () => {
    expect(buildInjectCode("recaptchav3", "T")).toContain("depth > 4")
  })

  it("creates the Turnstile response input when the form has none", () => {
    const code = buildInjectCode("turnstile", "T")
    expect(code).toContain("cf-turnstile-response")
    expect(code).toContain("createElement")
  })

  it("JSON-encodes the token so quotes in it cannot break out of the script", () => {
    const code = buildInjectCode("hcaptcha", 'to"ken')
    expect(code).toContain('"to\\"ken"')
  })
})
