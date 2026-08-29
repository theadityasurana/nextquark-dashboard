import { describe, expect, it } from "vitest"
import { buildApplicationEmail, detectEmailApply } from "./email-apply"

describe("detectEmailApply", () => {
  it("finds the address a posting directs applications to", () => {
    const t = detectEmailApply("To apply, send your CV to careers@example.com by 1 September.", false)
    expect(t?.address).toBe("careers@example.com")
    expect(t?.evidence).toContain("send your CV")
  })

  it("recognizes the common phrasings", () => {
    expect(detectEmailApply("Please email your resume to jobs@acme.io", false)?.address).toBe("jobs@acme.io")
    expect(detectEmailApply("Applications should be sent to hiring@acme.io", false)?.address).toBe("hiring@acme.io")
    expect(detectEmailApply("Apply via email: recruit@acme.io", false)?.address).toBe("recruit@acme.io")
  })

  it("returns nothing when the page has a real form", () => {
    // The form IS the channel. Emailing as well would duplicate the application.
    expect(detectEmailApply("Send your CV to careers@example.com", true)).toBeNull()
  })

  it("ignores an address that is merely present on the page", () => {
    // A footer contact address is not an application channel, and mailing a
    // résumé to the wrong place is worse than recording a failure.
    expect(detectEmailApply("Questions? Contact us at hello@example.com", false)).toBeNull()
    expect(detectEmailApply("Read our privacy policy or write to privacy@example.com", false)).toBeNull()
  })

  it("skips role addresses that are never an application channel", () => {
    expect(detectEmailApply("Send your CV to noreply@example.com", false)).toBeNull()
    expect(detectEmailApply("Email your resume to legal@example.com", false)).toBeNull()
  })

  it("does not reach across the page for an unrelated address", () => {
    const text = "To apply, email us. " + "filler ".repeat(60) + "press@example.com"
    expect(detectEmailApply(text, false)).toBeNull()
  })

  it("handles empty input", () => {
    expect(detectEmailApply("", false)).toBeNull()
  })
})

describe("buildApplicationEmail", () => {
  const input = {
    to: "careers@example.com",
    candidateName: "Priya Sharma",
    candidateEmail: "priya@example.com",
    jobTitle: "Backend Engineer",
    companyName: "Acme",
    pitch: "I have built payment systems at scale for six years.",
    resumeUrl: "https://files.example.com/resume.pdf",
  }

  it("puts the role and the candidate in the subject", () => {
    const { subject } = buildApplicationEmail(input)
    expect(subject).toContain("Backend Engineer")
    expect(subject).toContain("Acme")
    expect(subject).toContain("Priya Sharma")
  })

  it("includes the pitch and the résumé link", () => {
    const { html } = buildApplicationEmail(input)
    expect(html).toContain("payment systems at scale")
    expect(html).toContain("https://files.example.com/resume.pdf")
  })

  it("escapes HTML so a stray angle bracket cannot break the message", () => {
    const { html } = buildApplicationEmail({ ...input, candidateName: 'A<script>alert("x")</script>' })
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("omits the résumé line when there is no URL", () => {
    const { html } = buildApplicationEmail({ ...input, resumeUrl: null })
    expect(html).not.toContain("My résumé:")
  })
})
