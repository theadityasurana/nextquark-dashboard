import { describe, it, expect } from "vitest"
import { resumeUpload } from "./resume-file"

const pdf = Buffer.from("%PDF-1.7 rest")
const docx = Buffer.from("PK\u0003\u0004 rest", "latin1")

describe("resumeUpload", () => {
  it("adds the missing extension from the live Greenhouse rejection", () => {
    expect(resumeUpload("1789619121166.Dheeraj_Resume", pdf, "text/plain")).toEqual({
      name: "1789619121166.Dheeraj_Resume.pdf",
      mime: "application/pdf",
    })
  })

  it("corrects the type storage reports for a named PDF", () => {
    expect(resumeUpload("1789558743719.pdf", pdf, "text/plain")).toEqual({ name: "1789558743719.pdf", mime: "application/pdf" })
  })

  it("recognises a Word file", () => {
    const out = resumeUpload("cv", docx, "text/plain")
    expect(out.name).toBe("cv.docx")
    expect(out.mime).toContain("wordprocessingml")
  })

  it("drops a path and query string", () => {
    expect(resumeUpload("a/b/cv.pdf?x=1", pdf).name).toBe("cv.pdf")
  })

  it("falls back to a name forms accept for unknown bytes", () => {
    expect(resumeUpload("cv", Buffer.from("hello there"), "text/plain")).toEqual({ name: "cv.pdf", mime: "application/pdf" })
  })
})
