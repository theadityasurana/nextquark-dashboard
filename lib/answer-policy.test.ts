import { describe, it, expect } from "vitest"
import {
  routeField,
  validateAnswerForField,
  isBooleanChoice,
  looksLikeEssay,
  shapeOf,
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

  it("blocks rather than guesses when the profile has no value", () => {
    const r = routeField(f({ label: "LinkedIn Profile" }), { ...USER, linkedinUrl: "" })
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
  it("never auto-answers EEO questions from the schema group", () => {
    const r = routeField(
      f({ label: "How would you describe your racial background?", kind: "select", schemaGroup: "eeo" }),
      USER
    )
    expect(r.route).toBe("sensitive")
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

  it("never auto-answers a Lever diversity survey block", () => {
    const r = routeField(
      f({
        label: "Which of the following best describes you?",
        kind: "radio",
        key: "name:surveysResponses[ce20ed16-4902-4abc-992b-6d42ed679ae1][0]",
        options: ["A", "B"],
      }),
      USER
    )
    expect(r.route).toBe("sensitive")
  })

  it("never auto-answers a Lever eeo block", () => {
    const r = routeField(
      f({ label: "Race", kind: "radio", key: "name:eeo[race]", options: ["A", "B"] }),
      USER
    )
    expect(r.route).toBe("sensitive")
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
    // isConsentQuestion matches on "gdpr"; the Yes/No options are what prove it
    // is a question about the candidate, not a statement to agree to.
    expect(r.route).toBe("choice")
    expect((r as any).value).toBe("")
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

  it("sends genuine skills questions to the model rather than guessing", () => {
    for (const label of [
      "Have you professionally used SQL to query large datasets, profile data quality, and identify anomalies in production environments?",
      "Have you partnered with Data Stewards or business leaders to implement and enforce data ownership and governance processes?",
    ]) {
      const r = routeField(f({ label, kind: "select", options: ["Yes", "No"] }), USER)
      expect(r.route).toBe("choice")
      expect((r as any).value).toBe("")
    }
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

  it("leaves it for a human when there is neither a value nor a decline option", () => {
    const r = routeField(f({ label: "Sex", ...sex, options: ["Male", "Female"] }), { ...USER, gender: "" })
    expect(r.route).toBe("sensitive")
  })

  it("never lets a model choose a demographic answer", () => {
    for (const label of ["Race", "Veteran status", "Disability status"]) {
      const r = routeField(f({ label, kind: "select", schemaGroup: "eeo", options: ["A", "B"] }), { ...USER, ethnicity: "", veteranStatus: "", disabilityStatus: "" })
      expect([r.route, label]).toEqual(["sensitive", label])
    }
  })
})
