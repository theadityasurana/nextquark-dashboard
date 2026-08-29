import { describe, it, expect } from "vitest"
import { parseGreenhouseUrl, applySchema, type AtsSchema, type EnrichableItem } from "./ats-schema"

describe("parseGreenhouseUrl", () => {
  it("reads the classic board path", () => {
    expect(parseGreenhouseUrl("https://boards.greenhouse.io/acme/jobs/123456")).toEqual({
      board: "acme",
      jobId: "123456",
    })
  })

  it("reads the modern job-boards host", () => {
    expect(parseGreenhouseUrl("https://job-boards.greenhouse.io/vercel/jobs/6136160004")).toEqual({
      board: "vercel",
      jobId: "6136160004",
    })
  })

  it("reads the embed form, where both parts are in the query string", () => {
    expect(
      parseGreenhouseUrl("https://boards.greenhouse.io/embed/job_app?for=acme&token=987")
    ).toEqual({ board: "acme", jobId: "987" })
  })

  it("ignores a trailing slash and a hash", () => {
    expect(parseGreenhouseUrl("https://boards.greenhouse.io/acme/jobs/123#app")).toEqual({
      board: "acme",
      jobId: "123",
    })
  })

  it("returns null for other providers and for malformed input", () => {
    expect(parseGreenhouseUrl("https://jobs.lever.co/acme/abc")).toBeNull()
    expect(parseGreenhouseUrl("https://jobs.ashbyhq.com/acme/abc")).toBeNull()
    expect(parseGreenhouseUrl("not a url")).toBeNull()
  })

  it("returns null for a board listing with no job id", () => {
    expect(parseGreenhouseUrl("https://boards.greenhouse.io/acme")).toBeNull()
  })
})

const schema: AtsSchema = {
  portal: "Greenhouse",
  fields: [
    { name: "first_name", label: "First Name", type: "text", required: true, options: [], group: "custom" },
    {
      name: "question_62720861",
      label:
        "Please select the country where you currently reside. This determines which team you would join.",
      type: "select",
      required: true,
      options: ["India", "United States", "Germany"],
      group: "custom",
    },
    { name: "question_999", label: "On a later page", type: "text", required: true, options: [], group: "custom" },
    { name: "disability_status", label: "Disability Status", type: "select", required: false, options: ["Yes", "No"], group: "eeo" },
  ],
}

describe("applySchema", () => {
  it("joins on the provider's field name, not on label text", () => {
    const items: EnrichableItem[] = [
      // The scanner truncated the label and found no options on a closed dropdown.
      { key: "id:question_62720861", label: "Please select the country where you cu", kind: "text", required: false, options: [] },
    ]
    const { items: out } = applySchema(items, schema)
    expect(out[0].label).toBe(schema.fields[1].label)
    expect(out[0].options).toEqual(["India", "United States", "Germany"])
    expect(out[0].kind).toBe("select")
    expect(out[0].required).toBe(true)
    expect(out[0].schemaName).toBe("question_62720861")
  })

  it("strips the [] suffix Greenhouse puts on multi-selects", () => {
    const multi: AtsSchema = {
      portal: "Greenhouse",
      fields: [{ name: "question_5", label: "Countries", type: "multiselect", required: true, options: ["A"], group: "custom" }],
    }
    const { items } = applySchema(
      [{ key: "name:question_5[]", label: "Countries", kind: "text", required: false, options: [] }] as EnrichableItem[],
      multi
    )
    expect(items[0].schemaName).toBe("question_5")
  })

  it("tags EEO questions so the policy can decline them", () => {
    const { items } = applySchema(
      [{ key: "id:disability_status", label: "Disability Status", kind: "select", required: false, options: [] }] as EnrichableItem[],
      schema
    )
    expect(items[0].schemaGroup).toBe("eeo")
  })

  it("reports required questions that have no control on this page", () => {
    const { unmatchedRequired } = applySchema(
      [{ key: "id:first_name", label: "First Name", kind: "text", required: true, options: [] }],
      schema
    )
    expect(unmatchedRequired.map(f => f.name)).toEqual(["question_62720861", "question_999"])
  })

  it("leaves controls the schema does not know about untouched", () => {
    const items: EnrichableItem[] = [{ key: "idx:7", label: "Some custom widget", kind: "unknown", required: true, options: [] }]
    const { items: out } = applySchema(items, schema)
    expect(out[0]).toEqual(items[0])
  })

  it("keeps scanned options when the schema has none for a field", () => {
    const { items } = applySchema(
      [{ key: "id:first_name", label: "First Name", kind: "text", required: true, options: ["scanned"] }] as EnrichableItem[],
      schema
    )
    expect(items[0].options).toEqual(["scanned"])
  })
})
