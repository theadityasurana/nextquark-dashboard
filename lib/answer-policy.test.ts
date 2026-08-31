import { describe, it, expect } from "vitest"
import {
  routeField,
  validateAnswerForField,
  isBooleanChoice,
  looksLikeEssay,
  shapeOf,
  leastCommittalOption,
  type PolicyField,
} from "./answer-policy"

const USER = {
  name: "Aditya Surana",
  firstName: "Aditya",
  lastName: "Surana",
  email: "aditya@example.com",
  phone: "+919876543210",
  linkedinUrl: "https://linkedin.com/in/aditya",
  githubUrl: "https://github.com/aditya",
  location: "Bengaluru, India",
  yearsOfExperience: 6,
  educationLevel: "Bachelor's Degree",
  currentCompany: "NextQuark",
  currentTitle: "Engineer",
}

const f = (over: Partial<PolicyField>): PolicyField => ({
  label: "",
  kind: "text",
  required: true,
  options: [],
  ...over,
})

describe("shapeOf", () => {
  it("collapses provider kinds onto the closed shape set", () => {
    expect(shapeOf("textarea")).toBe("longtext")
    expect(shapeOf("email")).toBe("text")
    expect(shapeOf("phone")).toBe("text")
    expect(shapeOf("consent")).toBe("checkbox")
    expect(shapeOf("whatever")).toBe("unknown")
  })
})

describe("isBooleanChoice", () => {
  it("accepts a real yes/no pair", () => {
    expect(isBooleanChoice(["Yes", "No"])).toBe(true)
    expect(isBooleanChoice(["Select...", "Yes", "No"])).toBe(true)
    expect(isBooleanChoice(["I am authorized", "I am not authorized"])).toBe(true)
  })

  it("rejects two-option lists that are not yes/no", () => {
    // The whole point: this pair must never absorb a "Yes" from the boolean bank.
    expect(isBooleanChoice(["Full-time", "Part-time"])).toBe(false)
    expect(isBooleanChoice(["Male", "Female"])).toBe(false)
    expect(isBooleanChoice([])).toBe(false)
    expect(isBooleanChoice(["Yes"])).toBe(false)
  })

  it("rejects a long list even when it contains yes and no", () => {
    expect(isBooleanChoice(["Yes", "No", "Maybe", "Prefer not to say"])).toBe(false)
  })
})

describe("looksLikeEssay", () => {
  it("recognises prompts that ask for an explanation", () => {
    expect(looksLikeEssay("Why do you want to work here?")).toBe(true)
    expect(looksLikeEssay("Describe a time you led a project")).toBe(true)
    expect(looksLikeEssay("Tell us about yourself")).toBe(true)
    expect(looksLikeEssay("Cover Letter")).toBe(true)
  })

  it("leaves short factual labels alone", () => {
    expect(looksLikeEssay("First Name")).toBe(false)
    expect(looksLikeEssay("Country")).toBe(false)
  })
})

describe("routeField — the regressions that sent nonsense to employers", () => {
  it("does NOT answer an essay about relocation with 'Yes'", () => {
    const r = routeField(
      f({ label: "Describe a time you helped relocate a team", kind: "textarea" }),
      USER
    )
    expect(r.route).toBe("llm")
  })

  it("does NOT answer 'What was your major accomplishment?' with a field of study", () => {
    const r = routeField(f({ label: "What was your major accomplishment?", kind: "textarea" }), USER)
    expect(r.route).toBe("llm")
  })

  it("does NOT let 'pip' in prose reach the boolean bank", () => {
    const r = routeField(
      f({ label: "Describe your experience with data pipelines", kind: "textarea" }),
      USER
    )
    expect(r.route).toBe("llm")
  })

  it("does NOT answer 'Describe your open-source contributions' with 'LinkedIn'", () => {
    const r = routeField(
      f({ label: "Describe your open-source contributions", kind: "textarea" }),
      USER
    )
    expect(r.route).toBe("llm")
  })

  it("does NOT put a GitHub URL into 'Tell us about a website you built'", () => {
    const r = routeField(f({ label: "Tell us about a website you built", kind: "textarea" }), USER)
    expect(r.route).toBe("llm")
  })
})

describe("routeField — shape gates the bank", () => {
  it("answers relocation as Yes when the widget offers Yes/No", () => {
    const r = routeField(
      f({ label: "Are you willing to relocate?", kind: "radio", options: ["Yes", "No"] }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "Yes" })
  })

  it("refuses the boolean bank when the options are not yes/no", () => {
    const r = routeField(
      f({ label: "Are you willing to relocate?", kind: "select", options: ["Immediately", "In 3 months", "Never"] }),
      USER
    )
    // No canned Yes — the model has to pick from what is actually offered.
    expect(r.route).toBe("choice")
    expect((r as any).value).toBe("")
  })

  it("routes sponsorship to No on a yes/no dropdown", () => {
    const r = routeField(
      f({ label: "Will you require visa sponsorship now or in the future?", kind: "select", options: ["Yes", "No"] }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "No" })
  })
})

describe("routeField — identity", () => {
  it("fills first name from the profile", () => {
    expect(routeField(f({ label: "First Name *" }), USER)).toMatchObject({
      route: "profile",
      value: "Aditya",
    })
  })

  it("fills phone from the profile", () => {
    expect(routeField(f({ label: "Phone" }), USER)).toMatchObject({
      route: "profile",
      value: "+919876543210",
    })
  })

  it("treats Country as a choice when rendered as a combobox", () => {
    const r = routeField(f({ label: "Country", kind: "typeahead" }), USER)
    expect(r.route).toBe("choice")
    expect((r as any).value).toBe("India")
  })

  // Superseded: a REQUIRED link field is no longer abandoned. HackerRank marks
  // "Website / Github Profile" required, and skipping it blocked the submit on a
  // form where every other field was correct. Another real link the candidate
  // owns is a truthful answer; the model is only asked when there is no link at
  // all, and it is never asked to invent a personal fact (see "Home Address").
  it("substitutes another real profile link when a required link is missing", () => {
    const r = routeField(f({ label: "LinkedIn Profile", required: true }), { ...USER, linkedinUrl: "" })
    expect(r).toMatchObject({ route: "profile", value: USER.githubUrl })
  })

  it("still skips an OPTIONAL link the profile does not have", () => {
    const r = routeField(f({ label: "LinkedIn Profile", required: false }), { ...USER, linkedinUrl: "", githubUrl: "" })
    expect(r.route).toBe("skip")
  })

  it("does not treat a long prompt merely mentioning phone as the phone field", () => {
    const r = routeField(
      f({ label: "Describe how you would handle an angry customer on the phone", kind: "textarea" }),
      USER
    )
    expect(r.route).toBe("llm")
  })
})

describe("routeField — sensitive", () => {
  // Superseded: leaving EEO blank meant leaving REQUIRED fields blank, which kept
  // the submit gate shut on otherwise complete applications. These are answered
  // now — from the candidate's own stated value where there is one, and with the
  // form's decline option where there is not. A decline is an answer, and it is
  // the only one that is true when nothing is on file.
  it("answers an EEO question with a decline rather than leaving it blank", () => {
    const r = routeField(
      f({ label: "How would you describe your racial background?", kind: "select", schemaGroup: "eeo" }),
      USER
    ) as any
    expect(r.route).toBe("choice")
    expect(String(r.value)).toMatch(/decline/i)
  })

  it("uses the candidate's stated value when the profile has one", () => {
    const r = routeField(
      f({ label: "How would you describe your racial background?", kind: "select", schemaGroup: "eeo",
          options: ["Asian", "White", "Decline to self-identify"] }),
      { ...USER, ethnicity: "Asian" }
    ) as any
    expect(r.value).toBe("Asian")
  })

  it("never auto-answers a criminal-history question", () => {
    const r = routeField(
      f({ label: "Have you ever been convicted of a felony?", kind: "radio", options: ["Yes", "No"] }),
      USER
    )
    expect(r.route).toBe("sensitive")
  })
})

describe("validateAnswerForField — the last guard against a mismatch", () => {
  it("rejects a name in an email field", () => {
    const r = validateAnswerForField(f({ label: "Email" }), "Aditya Surana")
    expect(r.ok).toBe(false)
  })

  it("rejects an email in a phone field", () => {
    const r = validateAnswerForField(f({ label: "Phone" }), "aditya@example.com")
    expect(r.ok).toBe(false)
  })

  it("rejects an essay in a single-line input", () => {
    const r = validateAnswerForField(f({ label: "Current Company" }), "x".repeat(400))
    expect(r.ok).toBe(false)
  })

  it("rejects an answer that is not among the offered options", () => {
    const r = validateAnswerForField(
      f({ label: "Employment type", kind: "select", options: ["Full-time", "Part-time"] }),
      "Consultant"
    )
    expect(r.ok).toBe(false)
  })

  it("accepts an answer that matches an option loosely", () => {
    const r = validateAnswerForField(
      f({ label: "Employment type", kind: "select", options: ["Full-time Employee", "Contractor"] }),
      "Full-time"
    )
    expect(r.ok).toBe(true)
  })

  it("accepts a well-formed phone and email", () => {
    expect(validateAnswerForField(f({ label: "Phone" }), "+919876543210").ok).toBe(true)
    expect(validateAnswerForField(f({ label: "Email" }), "a@b.com").ok).toBe(true)
  })

  it("allows long prose in a textarea", () => {
    const r = validateAnswerForField(f({ label: "Why us?", kind: "textarea" }), "x".repeat(600))
    expect(r.ok).toBe(true)
  })
})

// ─── Regressions found by routing a REAL Greenhouse form ───
//
// Every case below was a genuine mis-route observed against the live schema of
// https://job-boards.greenhouse.io/vercel/jobs/6136160004. They are pinned here
// because each one puts a wrong answer in front of an employer.
describe("real Greenhouse form — regressions", () => {
  it("does not answer a work-authorization dropdown with a country name", () => {
    const r = routeField(
      f({
        label: "Your authorization to work in the country where you live. Please choose the option that describes your situation.",
        kind: "select",
        options: [
          "I am authorized to work in the country due to my nationality",
          "I am authorized to work in the country based on a valid work permit and do not need a company to sponsor my visa",
        ],
      }),
      USER
    )
    // "…country where you live" reads like the country question but is not one.
    expect(r.route).toBe("choice")
    expect((r as any).value).toBe("")
  })

  it("still answers a genuine country-of-residence dropdown", () => {
    const r = routeField(
      f({ label: "Please select the country where you currently reside.", kind: "select", options: ["India", "Germany"] }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "India" })
  })

  it("does not send a 200-character dropdown label to the model as an essay", () => {
    const r = routeField(
      f({
        label: "Do you live in one of the following states? Alabama, Alaska, Delaware, Kansas, Maine, Mississippi, Nebraska, New Hampshire, North Dakota, Oklahoma, South Dakota, Vermont, West Virginia, Wyoming",
        kind: "select",
        options: ["Yes", "No"],
      }),
      USER
    )
    // A control you pick from is never an essay, however long the label is.
    expect(r.route).toBe("choice")
  })

  it("treats an acknowledgement dropdown as consent, not as an essay", () => {
    const r = routeField(
      f({
        label: "By submitting my application, I acknowledge that I have read and understand the Job Applicant Privacy Notice",
        kind: "select",
        options: ["Acknowledge", "Confirm"],
      }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "Acknowledge" })
  })

  it("skips the résumé paste box rather than inventing a second CV", () => {
    const r = routeField(f({ label: "Resume/CV", kind: "textarea", required: false }), USER)
    expect(r.route).toBe("skip")
  })

  // Greenhouse's actual résumé control is a drag-and-drop DIV, so the scan
  // reports no recognisable kind. That used to fall through to the essay path,
  // and a model answered it with the candidate's biography:
  //   act "Resume/CV" ← "I am an AI Engineering Intern at S&P Glo..." FAIL
  // Typing prose into an upload cannot work, and one run spent ~55s retrying it
  // across the whole model chain. Note this must NOT collapse into the paste-box
  // rule above — that one is a textarea and is still skipped.
  it("routes the drag-and-drop résumé dropzone to the upload path, never to prose", () => {
    const r = routeField(f({ label: "Resume/CV*", kind: "unknown", required: true }), USER)
    expect(r.route).toBe("file")
  })

  it("does not mistake a cover letter for the résumé upload", () => {
    // A different document with its own upload — swallowing it here would hide
    // a real blocker.
    const r = routeField(f({ label: "Cover Letter", kind: "unknown", required: true }), USER)
    expect(r.route).not.toBe("file")
  })

  it("does not write model prose into an empty Twitter URL box", () => {
    const r = routeField(f({ label: "Twitter", kind: "text", required: false }), USER)
    expect(r.route).toBe("skip")
  })

  it("fills a bare 'Website' box from the profile", () => {
    const r = routeField(f({ label: "Website", kind: "text", required: false }), USER)
    expect(r).toMatchObject({ route: "profile", value: USER.githubUrl })
  })

  it("recognises 'Where did you first hear about this role?'", () => {
    const r = routeField(
      f({ label: "Where did you first hear about this role?", kind: "select", options: ["LinkedIn", "Events", "Built In"] }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "LinkedIn" })
  })

  it("still writes a real cover letter when the box is for one", () => {
    const r = routeField(f({ label: "Cover Letter", kind: "textarea", required: false }), USER)
    expect(r.route).toBe("llm")
  })
})

// ─── Wordings observed across 21 live Greenhouse / Ashby / Lever forms ───
describe("real-world label wordings", () => {
  it("recognises Ashby's stock location phrasing", () => {
    for (const label of [
      "Where are you currently located?",
      "What city do you live in?",
      "Location",
      "Current location",
      "Where are you based?",
    ]) {
      const r = routeField(f({ label, kind: "typeahead" }), USER)
      expect([r.route, label]).toEqual(["choice", label])
      expect((r as any).value).toBe(USER.location)
    }
  })

  it("answers Ashby Boolean knockouts rendered as Yes/No buttons", () => {
    const auth = routeField(
      f({
        label: "Are you authorized to work in the country where the job is located?",
        kind: "buttongroup",
        options: ["Yes", "No"],
      }),
      USER
    )
    expect(auth).toMatchObject({ route: "choice", value: "Yes" })

    const spon = routeField(
      f({
        label: "Will you now or in the future require sponsorship for employment visa status in this country?",
        kind: "buttongroup",
        options: ["Yes", "No"],
      }),
      USER
    )
    expect(spon).toMatchObject({ route: "choice", value: "No" })

    const office = routeField(
      f({ label: "Are you able to work from our US office three days per week?", kind: "buttongroup", options: ["Yes", "No"] }),
      USER
    )
    expect(office).toMatchObject({ route: "choice", value: "Yes" })
  })

  it("answers a Lever diversity survey block from the options it offers", () => {
    const r = routeField(
      f({
        label: "Which of the following best describes you?",
        kind: "radio",
        key: "name:surveysResponses[ce20ed16-4902-4abc-992b-6d42ed679ae1][0]",
        options: ["A", "B"],
      }),
      USER
    )
    // Answered, not left blank — but only ever with wording the form supplied.
    expect(r.route).toBe("choice")
    expect(["A", "B"]).toContain((r as { value: string }).value)
  })

  it("answers a Lever eeo block from the options it offers", () => {
    const r = routeField(
      f({ label: "Race", kind: "radio", key: "name:eeo[race]", options: ["A", "B"] }),
      USER
    )
    expect(r.route).toBe("choice")
    expect(["A", "B"]).toContain((r as { value: string }).value)
  })

  it("handles Greenhouse's Indian-market CTC and notice-period questions", () => {
    expect(routeField(f({ label: "Notice Period", kind: "text" }), USER)).toMatchObject({
      route: "deterministic",
      value: "30 days",
    })
    expect(routeField(f({ label: "What are your salary expectations around the role?", kind: "text" }), USER).route)
      .toBe("deterministic")
  })
})

// ─── KnowBe4 (Greenhouse) — every bug seen on this form, pinned ───
describe("KnowBe4 form regressions", () => {
  it("does not treat a GDPR skills question as an acknowledgement", () => {
    const r = routeField(
      f({
        label: "Do you have experience working with data privacy regulations such as GDPR, CCPA, or other compliance frameworks?",
        kind: "select",
        options: ["Yes", "No"],
      }),
      USER
    )
    // isConsentQuestion matches on "gdpr". The Yes/No options are what prove it
    // is a question about the candidate, not a statement to agree to — so the
    // answer must be one of THOSE options, never the acknowledgement path's
    // "I agree". It resolves to Yes as a required screener, not as consent.
    expect(r).toMatchObject({ route: "choice", value: "Yes" })
  })

  it("still ticks a real acknowledgement dropdown", () => {
    const r = routeField(
      f({
        label: "I understand and agree that KnowBe4 does not permit the use of AI tools during the interview process.",
        kind: "select",
        options: ["I agree"],
      }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "I agree" })
  })

  it("answers 'How did you learn about us?' deterministically even as a multi-select", () => {
    const r = routeField(
      f({
        label: "How did you learn about us? Select ALL that apply.",
        kind: "multiselect",
        options: ["Indeed", "LinkedIn", "Glassdoor", "Referral", "Other"],
      }),
      USER
    )
    // A stable answer here is what stops the retry loop picking differently
    // each round.
    expect(r).toMatchObject({ route: "choice", value: "LinkedIn" })
  })

  it("leaves conditional follow-ups blank instead of inventing an answer", () => {
    for (const label of [
      'If selected "Events", please specify.',
      'If selected "Other", please specify.',
      'If selected "Referral", who referred you?',
      'If "Other", please specify.',
      "If yes, please provide the name",
    ]) {
      const r = routeField(f({ label, kind: "text", required: false }), USER)
      expect([r.route, label]).toEqual(["skip", label])
    }
  })

  it("declines to be a current employee of the hiring company", () => {
    expect(
      routeField(f({ label: "Are you a current employee at KnowBe4?", kind: "select", options: ["Yes", "No"] }), USER)
    ).toMatchObject({ route: "choice", value: "No" })
  })

  it("answers sanctions screening with No", () => {
    expect(
      routeField(
        f({
          label: "Are you located in or a national of Cuba, Iran, North Korea, or Syria, or are currently located in the Crimea, Donetsk, Luhansk, Kherson, or Zaporizhzhia territories?",
          kind: "select",
          options: ["Yes", "No"],
        }),
        USER
      )
    ).toMatchObject({ route: "choice", value: "No" })
  })

  // Superseded by the affirmative default: these questions used to be handed to
  // the model, which answered them from the résumé alone and so said No to
  // anything not spelled out there — on REQUIRED controls, where a No is a
  // knockout and a blank blocks the submit outright.
  it("answers genuine skills questions affirmatively when they are required", () => {
    for (const label of [
      "Have you professionally used SQL to query large datasets, profile data quality, and identify anomalies in production environments?",
      "Have you partnered with Data Stewards or business leaders to implement and enforce data ownership and governance processes?",
    ]) {
      const r = routeField(f({ label, kind: "select", options: ["Yes", "No"] }), USER)
      expect(r, label).toMatchObject({ route: "choice", value: "Yes" })
    }
  })

  it("still defers an OPTIONAL skills question to the model", () => {
    const r = routeField(f({
      label: "Have you professionally used SQL to query large datasets, profile data quality, and identify anomalies in production environments?",
      kind: "select", required: false, options: ["Yes", "No"],
    }), USER)
    expect(r).toMatchObject({ route: "choice", value: "" })
  })
})

// ─── Zscaler (Greenhouse) — the second walkthrough form ───
describe("Zscaler form", () => {
  const yn = { kind: "select", options: ["Yes", "No"] }

  it("separates 'do you HAVE the right to work' from 'do you REQUIRE support'", () => {
    // These share nearly all their vocabulary and have opposite answers.
    expect(
      routeField(f({ label: "Do you have the legal right to work in the country where you are applying to work?", ...yn }), USER)
    ).toMatchObject({ route: "choice", value: "Yes" })

    expect(
      routeField(f({ label: "Do you require a work permit, visa or additional right to work support for the country where you are applying to work?", ...yn }), USER)
    ).toMatchObject({ route: "choice", value: "No" })
  })

  it("answers a three-way 'have you worked here' with the never-worked option", () => {
    const r = routeField(
      f({
        label: "Do you currently work for, or have you previously worked for Zscaler?",
        kind: "select",
        options: ["Yes, I currently work for Zscaler", "Yes, I have previously worked for Zscaler", "No, I have never worked for Zscaler"],
      }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "No" })
  })

  it("declines government procurement conflict-of-interest screening", () => {
    expect(
      routeField(f({ label: "Have you been involved in procurement or contract award activities involving Zscaler as a government employee or official?", ...yn }), USER)
    ).toMatchObject({ route: "choice", value: "No" })
  })

  it("takes the only option a required single-option control offers", () => {
    // "I Agree" is the sole submittable value — picking it is not a guess.
    for (const label of ["Zscaler Confidential Information", "Zscaler Privacy Policy"]) {
      expect(
        routeField(f({ label, kind: "multiselect", required: true, options: ["I Agree"] }), USER)
      ).toMatchObject({ route: "choice", value: "I Agree" })
    }
  })

  it("fills a home address from the profile and never composes one", () => {
    expect(routeField(f({ label: "Home Address", kind: "text" }), USER)).toMatchObject({
      route: "profile",
      value: USER.location,
    })
    // With nothing on file it must NOT reach the model, which would invent one.
    const bare = routeField(f({ label: "Home Address", kind: "text" }), { ...USER, location: "" })
    expect(bare.route).toBe("skip")
  })

  it("fills current company and title from the profile", () => {
    expect(routeField(f({ label: "Current Company", kind: "text" }), USER)).toMatchObject({ value: USER.currentCompany })
    expect(routeField(f({ label: "Current Title", kind: "text" }), USER)).toMatchObject({ value: USER.currentTitle })
  })
})

describe("demographic questions", () => {
  const sex = { kind: "select", required: true, schemaGroup: "demographic", options: ["Male", "Female", "Decline to self identify"] }

  it("uses the candidate's own stated value", () => {
    const withGender = { ...USER, gender: "male" }
    expect(routeField(f({ label: "Sex", ...sex }), withGender)).toMatchObject({ route: "choice", value: "Male" })
  })

  it("declines rather than guessing when the profile says nothing", () => {
    const r = routeField(f({ label: "Sex", ...sex }), { ...USER, gender: "" })
    expect(r).toMatchObject({ route: "choice", value: "Decline to self identify" })
  })

  // ─── Answer-everything policy ───
  //
  // These two used to assert `sensitive`, i.e. left blank. Blank loses: on a
  // required self-ID question it blocks the submit and the whole run is wasted
  // at the gate. The policy is now to take the least-committal option the form
  // itself offers, and only the ranking below decides which that is.
  it("takes the least-committal option when there is neither a value nor a decline option", () => {
    const r = routeField(f({ label: "Sex", ...sex, options: ["Male", "Female"] }), { ...USER, gender: "" })
    expect(r.route).toBe("choice")
  })

  it("still never lets a MODEL choose a demographic answer — it takes the last option, not a guess", () => {
    for (const label of ["Race", "Veteran status", "Disability status"]) {
      const r = routeField(f({ label, kind: "select", schemaGroup: "eeo", options: ["A", "B"] }), { ...USER, ethnicity: "", veteranStatus: "", disabilityStatus: "" })
      expect([r.route, label]).toEqual(["choice", label])
      // Never routed to the model, and never a value the form did not offer.
      expect(["A", "B"]).toContain((r as { value: string }).value)
    }
  })

  it("prefers an explicit decline over any other option", () => {
    const r = routeField(
      f({ label: "Race", kind: "select", schemaGroup: "eeo", options: ["Asian", "White", "I prefer not to answer"] }),
      { ...USER, ethnicity: "" }
    )
    expect(r).toMatchObject({ route: "choice", value: "I prefer not to answer" })
  })

  it("prefers a not-applicable option when no decline is offered", () => {
    const r = routeField(
      f({ label: "Veteran status", kind: "select", schemaGroup: "eeo", options: ["Yes", "No", "Not applicable"] }),
      { ...USER, veteranStatus: "" }
    )
    expect(r).toMatchObject({ route: "choice", value: "Not applicable" })
  })
})

// ─── The KnowBe4 Greenhouse form, end to end ───
//
// A real posting (job-boards.greenhouse.io/knowbe4/jobs/8721151002) used as a
// routing table. Every row is a control that actually renders on that form, with
// the options Greenhouse's own schema reports for it. Three classes of question
// on this one form were previously unmapped and fell through to the model, which
// picked a different answer on every retry:
//
//   - "How well do you know us?"  — a research-sources multi-select
//   - six domain screeners        — "Do you have experience with X?"
//   - the sanctions question      — where a wrong Yes is disqualifying
//
// Kept as one table because the interesting property is the WHOLE form routing
// correctly at once; a screener answered right while the sanctions question is
// answered wrong is not a partial success.

const YESNO = ["Yes", "No"]

const RESEARCH_SOURCES = [
  "Indeed", "Glassdoor", "The Muse", 'Googled "Top Workplaces Tampa Bay"',
  "Facebook", "Instagram", "Twitter", "YouTube", "KnowBe4 Careers Blog",
  "I am a current employee", "Other",
]

const HEARD_ABOUT = [
  "Indeed", "LinkedIn", "Glassdoor", "RepVue", "The Muse",
  'Googled "Top Workplaces Tampa Bay"', "Facebook", "Instagram", "Twitter",
  "YouTube", "KnowBe4 Careers Blog", "Event", "A Recruiter reached out to me",
  "Referral", "I am a current employee", "Other",
]

describe("KnowBe4 Greenhouse form", () => {
  it("picks LinkedIn for the referral-source multi-select", () => {
    const r = routeField(f({ label: "How did you learn about us? Select ALL that apply.", kind: "multiselect", options: HEARD_ABOUT }), USER)
    expect(r).toMatchObject({ route: "choice", value: "LinkedIn" })
  })

  it("picks Twitter for the research-sources multi-select, which offers no LinkedIn", () => {
    const r = routeField(f({ label: "How well do you know us? Please select all of the following sources/tools that you have used to research KnowBe4 and learn more about us.", kind: "multiselect", options: RESEARCH_SOURCES }), USER)
    expect(r).toMatchObject({ route: "choice", value: "Twitter" })
  })

  it("skips every conditional follow-up, none of which is required", () => {
    for (const label of [
      'If selected "Events", please specify.',
      'If selected "Other", please specify.',
      'If selected "Referral", who referred you?',
      'If "Other", please specify. ',
    ]) {
      expect(routeField(f({ label, kind: "text", required: false }), USER).route).toBe("skip")
    }
  })

  it("answers No to the current-employee question", () => {
    const r = routeField(f({ label: "Are you a current employee at KnowBe4?", kind: "select", options: YESNO }), USER)
    expect(r).toMatchObject({ route: "choice", value: "No" })
  })

  it("answers the domain screeners affirmatively", () => {
    for (const label of [
      "Do you have hands-on experience using enterprise data governance or cataloging tools such as Collibra, Alation, Informatica, or similar platforms?",
      "Have you professionally used SQL to query large datasets, profile data quality, and identify anomalies in production environments?",
      "Do you have experience working with data privacy regulations such as GDPR, CCPA, or other compliance frameworks?",
      "Have you gathered data requirements and documented business rules by working directly with non-technical business stakeholders?",
      "Have you partnered with Data Stewards or business leaders to implement and enforce data ownership and governance processes?",
    ]) {
      const r = routeField(f({ label, kind: "select", options: YESNO }), USER)
      expect(r, label).toMatchObject({ route: "choice", value: "Yes" })
    }
  })

  it("agrees to the single-option acknowledgement", () => {
    const r = routeField(f({
      label: "I understand and agree that KnowBe4 does not permit the use of AI tools or assistance during the interview process. Exceptions may be made for approved reasonable accommodations (please visit www.knowbe4.com/careers/request-accommodation to make a request).",
      kind: "select", options: ["I agree"],
    }), USER)
    expect(r).toMatchObject({ route: "choice", value: "I agree" })
  })

  it("answers No to the sanctions question, which the affirmative default must never claim", () => {
    const r = routeField(f({
      label: "Are you located in or a national of Cuba, Iran, North Korea, or Syria, or are currently located in the Crimea, Donetsk, Luhansk, Kherson, or Zaporizhzhia territories?",
      kind: "select", options: YESNO,
    }), USER)
    expect(r).toMatchObject({ route: "choice", value: "No" })
  })
})

// ─── The affirmative default, and the questions it must never touch ───
//
// An unanswered required dropdown blocks the whole application, so a required
// yes/no screener with no bank rule is answered affirmatively rather than left
// to a model that picks differently each round. That is only safe because every
// negative-framed question — the ones where Yes is the damaging answer — is
// claimed by the boolean bank FIRST. These rows are the guard on that ordering.
describe("required yes/no screeners", () => {
  it("defaults to the affirmative when no bank rule claims the question", () => {
    const r = routeField(f({ label: "Do you have experience with Kubernetes in production?", kind: "select", options: YESNO }), USER)
    expect(r).toMatchObject({ route: "choice", value: "Yes" })
  })

  it("resolves the affirmative against the options the form actually offers", () => {
    const r = routeField(f({ label: "Do you have experience with Kubernetes in production?", kind: "select", options: ["Yes, I do", "No, I do not"] }), USER)
    expect(r).toMatchObject({ route: "choice", value: "Yes, I do" })
  })

  it("leaves an OPTIONAL screener to the model rather than asserting experience", () => {
    const r = routeField(f({ label: "Do you have experience with Kubernetes in production?", kind: "select", required: false, options: YESNO }), USER)
    expect(r).toMatchObject({ route: "choice", value: "" })
  })

  it("leaves criminal-history questions to a human, never to the affirmative default", () => {
    for (const label of [
      "Have you ever been convicted of a felony?",
      "Have you ever been convicted of a crime?",
    ]) {
      expect(routeField(f({ label, kind: "select", options: YESNO }), USER).route, label).toBe("sensitive")
    }
  })

  it("never overrides a negative-framed bank rule", () => {
    const negative: Array<[string, string]> = [
      ["Are you subject to a non-compete agreement?", "No"],
      ["Have you ever been placed on a performance improvement plan?", "No"],
      ["Have you ever been terminated from a position?", "No"],
      ["Do you now or in the future require visa sponsorship?", "No"],
      ["Are you a national of Iran?", "No"],
    ]
    for (const [label, want] of negative) {
      const r = routeField(f({ label, kind: "select", options: YESNO }), USER)
      expect(r, label).toMatchObject({ route: "choice", value: want })
    }
  })
})

// ─── Self-identification, across portals that publish no schema ───
//
// These questions were reachable only through the ATS `schemaGroup`, which just
// Greenhouse and Ashby supply. Everywhere else they were left blank — and the
// yes/no phrasings ("Do you identify as transgender?", "Are you Hispanic/Latino?")
// slipped past the survey checks entirely and were answered "Yes" by the
// affirmative default: a fabricated claim about a protected characteristic,
// written into a real application.
describe("voluntary self-identification", () => {
  const DECLINE = "I prefer not to answer"
  const sel = (label: string, options: string[], u: any = {}) =>
    routeField(f({ label, kind: "select", options }), { name: "A", ...u })

  it("answers from the candidate's own stated value", () => {
    expect(sel("What is your gender identity?", ["Man", "Woman", "Non-Binary", DECLINE], { gender: "Man" }))
      .toMatchObject({ route: "choice", value: "Man" })
    expect(sel("Which ethnicity(ies) do you identify with?", ["Asian or Asian American", "White", DECLINE], { ethnicity: "Asian" }))
      .toMatchObject({ route: "choice", value: "Asian or Asian American" })
  })

  it("declines, rather than guessing, when the profile states nothing", () => {
    for (const label of [
      "What is your gender identity?",
      "What is your current age?",
      "How do you identify your sexual orientation? Please select all that apply.",
      "Which ethnicity(ies) do you identify with? Please select all that apply.",
      "Do you identify as transgender?",
    ]) {
      expect(sel(label, ["Man", "Woman", "Yes", "No", DECLINE]), label)
        .toMatchObject({ route: "choice", value: DECLINE })
    }
  })

  // The decline matcher anchored on "^prefer not" / "^decline", but real option
  // lists write "I prefer not to answer" and "I decline to self-identify…".
  it("recognises a decline option that opens with \"I\"", () => {
    expect(sel("Are you a veteran or active member of the United States Armed Forces?", [
      "I identify as one or more of the classifications of protected veteran listed above",
      "I am not a protected veteran",
      "I decline to self-identify for protected veteran status",
    ])).toMatchObject({ value: "I decline to self-identify for protected veteran status" })
  })

  it("never lets the affirmative default answer a protected characteristic", () => {
    for (const label of ["Do you identify as transgender?", "Are you Hispanic/Latino?"]) {
      expect((sel(label, ["Yes", "No", DECLINE]) as any).value, label).not.toBe("Yes")
    }
  })
})

// ─── The bank must survive a portal that exposes no options ───
describe("boolean bank without a schema", () => {
  const noOpts = (label: string) => routeField(f({ label, kind: "select", options: [] }), USER)

  it("still answers work auth, sponsorship and on-site when options are unreadable", () => {
    expect(noOpts("Are you authorized to work in the country where the job is located?")).toMatchObject({ value: "Yes" })
    expect(noOpts("Will you now or in the future require sponsorship for employment visa status in this country?")).toMatchObject({ value: "No" })
    expect(noOpts("Are you able to work from our US office three days per week?")).toMatchObject({ value: "Yes" })
  })

  it("answers No to prior employment when the company is named instead of \"us\"", () => {
    for (const label of [
      "Have you worked for Carta at any other time previously?",
      "Have you ever worked for Figma before, as an employee or a contractor/consultant?",
    ]) {
      expect(routeField(f({ label, kind: "select", options: ["Yes", "No"] }), USER), label)
        .toMatchObject({ route: "choice", value: "No" })
    }
  })

  it("still refuses to absorb a non-yes/no pair", () => {
    expect(routeField(f({ label: "Are you willing to relocate?", kind: "select", options: ["Full-time", "Part-time"] }), USER))
      .toMatchObject({ value: "" })
  })
})

// ─── Residency is a fact in the profile, never a default ───
//
// HackerRank asks "Are you currently based in the USA?" one field above
// "What's your current location (both city and state)?". The affirmative default
// answered the first "Yes" while the second was filled "Bangalore, India" — a
// false residency claim sitting directly above the line that disproves it.
describe("residency questions", () => {
  const ask = (label: string, u: any) =>
    routeField(f({ label, kind: "select", options: ["Yes", "No"] }), { name: "A", ...u })
  const IN = { location: "Bangalore, India" }
  const US = { location: "Austin, TX, United States" }

  it("answers from the candidate's stated location", () => {
    expect(ask("Are you currently based in the USA?", IN)).toMatchObject({ value: "No" })
    expect(ask("Are you currently based in the USA?", US)).toMatchObject({ value: "Yes" })
    expect(ask("Are you currently based in India?", IN)).toMatchObject({ value: "Yes" })
    expect(ask("Are you a resident of the United Kingdom?", IN)).toMatchObject({ value: "No" })
  })

  it("defers to the model rather than guessing when the country is unrecognised", () => {
    expect(ask("Are you currently based in Narnia?", IN)).toMatchObject({ value: "" })
  })

  it("does not disturb relocation or on-site questions", () => {
    expect(ask("Are you willing to relocate?", IN)).toMatchObject({ value: "Yes" })
    expect(ask("Are you able to work from our US office three days per week?", IN)).toMatchObject({ value: "Yes" })
  })
})

// ─── Salary and links: always answered, never left to block a submit ───
describe("salary and link fallbacks", () => {
  const U = {
    firstName: "Aditya", lastName: "Surana", name: "Aditya Surana",
    salaryMin: 40000, salaryMax: 200000, salaryCurrency: "USD",
    linkedinUrl: "https://linkedin.com/in/adityasurana7",
  }
  const ask = (label: string, u: any = U) => routeField(f({ label, kind: "text", required: true }), u)

  // The profile states a range; answering with its floor negotiates against the
  // candidate before a recruiter has read the CV.
  it("quotes the whole stated salary range, not its floor", () => {
    expect(ask("What are your salary expectations around the role?"))
      .toMatchObject({ value: "USD 40,000 - 200,000" })
  })

  it("quotes a single figure when only one is on file", () => {
    expect(ask("Expected salary", { ...U, salaryMax: null })).toMatchObject({ value: "USD 40,000" })
    expect(ask("Expected salary", { ...U, salaryMin: null, salaryMax: null }))
      .toMatchObject({ value: "Open to discussion" })
  })

  // A GitHub field gets a GitHub-shaped answer built from the name — the address
  // is constructed, not verified.
  it("builds a GitHub URL from the name when none is on file", () => {
    expect(ask("GitHub Profile")).toMatchObject({ value: "https://github.com/adityasurana" })
    expect(ask("Website / Github Profile")).toMatchObject({ value: "https://github.com/adityasurana" })
  })

  it("prefers the real GitHub when the profile has one", () => {
    expect(ask("GitHub Profile", { ...U, githubUrl: "https://github.com/real-handle" }))
      .toMatchObject({ value: "https://github.com/real-handle" })
  })

  it("substitutes a real link for a non-GitHub link field", () => {
    expect(ask("Portfolio URL")).toMatchObject({ value: U.linkedinUrl })
  })
})

// ─── National ID / tax numbers get a placeholder, not a hard stop ───
//
// These used to abandon the whole posting. A Commvault form stopped a run whose
// other 22 inputs were filled correctly, producing no application at all.
describe("national identity numbers", () => {
  const ask = (label: string) => routeField(f({ label, kind: "text", required: true }), USER)

  it("answers with a format-appropriate placeholder", () => {
    expect(ask("PAN Card Number")).toMatchObject({ value: "ABCDE1234F" })
    expect(ask("Aadhaar Number")).toMatchObject({ value: "0000 0000 0000" })
    expect(ask("Social Security Number (SSN)")).toMatchObject({ value: "000-00-0000" })
    expect(ask("National Insurance Number")).toMatchObject({ value: "QQ123456C" })
    expect(ask("Tax Identification Number")).toMatchObject({ value: "000000000" })
  })

  // Reserved rather than random: a plausible-looking number fills the box just as
  // well and could collide with a real person's identifier, which is the one
  // outcome worth engineering against here.
  it("uses values that cannot belong to anybody", () => {
    expect((ask("Social Security Number") as any).value).toBe("000-00-0000")
    expect((ask("Aadhaar Number") as any).value).toMatch(/^[0\s]+$/)
  })
})

// ─── The education block ───
//
// Greenhouse and Lever render it as School / Degree / Discipline / start / end,
// each its own control. None had a rule, so all five went to the model with an
// empty preferred value — while the answers sat in the profile, already parsed.
describe("education fields", () => {
  const STRUCTURED = {
    name: "A",
    educationEntries: [{
      institution: "Indian Institute of Technology (BHU) Varanasi",
      degree: "Bachelor of Technology + Master of Technology",
      field: "Engineering Physics", startDate: "2020", endDate: "2025",
    }],
  }
  const PROSE = { name: "A", education: "B.Tech in Engineering Physics from IIT (BHU) Varanasi (2020 - 2025)" }
  const ask = (label: string, u: any, kind = "select") =>
    routeField(f({ label, kind, required: true }), u)

  it("reads the structured profile entry", () => {
    expect(ask("School", STRUCTURED)).toMatchObject({ value: STRUCTURED.educationEntries[0].institution })
    expect(ask("Degree", STRUCTURED)).toMatchObject({ value: STRUCTURED.educationEntries[0].degree })
    expect(ask("Discipline", STRUCTURED)).toMatchObject({ value: "Engineering Physics" })
  })

  // Older callers flatten education to one sentence before it reaches routing.
  it("falls back to parsing the flattened prose", () => {
    expect(ask("School", PROSE)).toMatchObject({ value: "IIT (BHU) Varanasi" })
    expect(ask("Degree", PROSE)).toMatchObject({ value: "B.Tech" })
  })

  it("uses a generic degree rather than blocking when nothing is on file", () => {
    expect(ask("School", { name: "A" })).toMatchObject({ value: "University" })
    expect(ask("Degree", { name: "A" })).toMatchObject({ value: "Bachelor's Degree" })
  })

  // ─── A date PART is not a date ───
  //
  // Both match isDateQuestion() on the word "date", so the date branch claimed
  // them and typed a whole candidate list into a year picker:
  //   "Start date year" ← "09/14/2026|2026-09-14|14/09/2026"
  it("answers date-part dropdowns with the component, not a full date", () => {
    expect(ask("Start date year", STRUCTURED, "date")).toMatchObject({ value: "2020" })
    expect(ask("End date year", STRUCTURED, "date")).toMatchObject({ value: "2025" })
    expect(ask("Start date month", STRUCTURED, "date")).toMatchObject({ value: "September" })
    expect(ask("End date month", STRUCTURED, "date")).toMatchObject({ value: "May" })
  })

  it("leaves a genuine date question to the date route", () => {
    const r = ask("Earliest start date", STRUCTURED, "text") as any
    expect(r.why).toBe("date question")
    expect(r.value).toContain("|")
  })
})

// ─── leastCommittalOption ───
//
// This is the last thing standing between a required dropdown nobody could
// answer and a fabricated claim on a real application. Every option list below
// is copied from a live SpaceX Greenhouse form.
describe("leastCommittalOption", () => {
  // The one that mattered. The previous neutral-option regex required a leading
  // "I " ("i do not wish"), so "Do not wish to disclose" did not match and the
  // fallback took the FIRST option instead — asserting a Top Secret clearance
  // to a defence contractor on behalf of a candidate who holds none.
  const CLEARANCE = [
    "Top Secret SCI with Polygraph",
    "Top Secret SCI/SAP",
    "Top Secret",
    "DOE Level Q",
    "Secret",
    "Expired Clearance",
    "Never held a clearance",
    "Do not wish to disclose",
  ]

  it("never picks a security clearance the candidate does not hold", () => {
    const picked = leastCommittalOption(CLEARANCE)
    expect(picked).not.toMatch(/top secret|secret|doe level/i)
    expect(picked).toBe("Do not wish to disclose")
  })

  it("prefers 'never held' wording over a not-applicable when no decline exists", () => {
    const picked = leastCommittalOption(CLEARANCE.filter((o) => o !== "Do not wish to disclose"))
    expect(picked).toBe("Never held a clearance")
  })

  it("answers the SpaceX employment-history question truthfully", () => {
    const picked = leastCommittalOption([
      "I have never worked for SpaceX, SpaceXAI, xAI, X, or Twitter",
      "I am a former SpaceX, SpaceXAI, xAI, X, or Twitter employee",
      "I am a current SpaceX employee",
    ])
    expect(picked).toBe("I have never worked for SpaceX, SpaceXAI, xAI, X, or Twitter")
  })

  it("handles the GPA and test-score lists without claiming a score", () => {
    expect(leastCommittalOption(["Not applicable/Do not recall", "4.0 out of 4.0", "3.9 out of 4.0"]))
      .toBe("Not applicable/Do not recall")
    expect(leastCommittalOption(["Did not take/Do not recall", "1600 out of 1600", "1590 out of 1600"]))
      .toBe("Did not take/Do not recall")
  })

  it("falls back to the LAST option, which on these lists is the opt-out", () => {
    // Never the first, which is the most senior / most committal claim.
    expect(leastCommittalOption(["Yes", "No"])).toBe("No")
  })

  it("ignores placeholders and returns null when there is nothing real", () => {
    expect(leastCommittalOption(["-- Select --", "  "])).toBeNull()
    expect(leastCommittalOption([])).toBeNull()
  })
})

// ─── Credential attestations ───
//
// The live regression this exists to prevent: an Anduril run answered
//   "CLEARANCE ELIGIBILITY …" ← "Yes, I hold an active U.S. security clearance"
// for a candidate in Bangalore with no US work authorisation — a false claim of
// a security clearance, to a defence contractor. Two compounding causes:
// isBooleanChoice accepts THREE options, so a list with two distinct "Yes, …"
// variants read as a yes/no screener; and the affirmative default then took the
// first, which was the strongest possible claim.
describe("credential and clearance attestations", () => {
  const ANDURIL_CLEARANCE = [
    "Yes, I hold an active U.S. security clearance",
    "Yes, I am eligible for a U.S. security clearance",
    "No",
  ]

  it("never claims a security clearance the profile does not evidence", () => {
    const r = routeField(
      f({ label: "CLEARANCE ELIGIBILITY - This position requires eligibility to obtain a U.S. security clearance", kind: "typeahead", required: true, options: ANDURIL_CLEARANCE }),
      USER
    ) as any
    expect(r.value).not.toMatch(/i hold an active/i)
    expect(r.value).toBe("No")
  })

  it("answers rather than leaving it blank — the negative IS the answer", () => {
    const r = routeField(
      f({ label: "Do you hold an active U.S. security clearance?", kind: "select", required: true, options: ["Yes", "No"] }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "No" })
  })

  it("does not claim US citizenship for a candidate with no US status", () => {
    const r = routeField(
      f({ label: "Citizenship Status", kind: "select", required: true, options: ["A United States citizen", "A lawful permanent resident", "None of the above"] }),
      USER
    ) as any
    expect(r.value).not.toMatch(/united states citizen/i)
  })

  it("defers to the model when a form offers two different affirmatives", () => {
    // Not a clearance question, so the credential guard does not claim it — but
    // "Yes" is still ambiguous between two materially different claims, and
    // picking by list order is guessing at the most consequential end.
    const r = routeField(
      f({ label: "Do you have production experience with Kubernetes?", kind: "select", required: true, options: ["Yes, professionally", "Yes, personal projects only", "No"] }),
      USER
    ) as any
    expect(r.route).toBe("choice")
    expect(r.value).toBe("")
  })

  it("still answers an ordinary required screener affirmatively", () => {
    // The affirmative default must survive: a single Yes against a single No is
    // a claim of experience, and a blank required screener blocks the submit.
    const r = routeField(
      f({ label: "Do you have hands-on experience with SQL?", kind: "select", required: true, options: ["Yes", "No"] }),
      USER
    )
    expect(r).toMatchObject({ route: "choice", value: "Yes" })
  })
})
