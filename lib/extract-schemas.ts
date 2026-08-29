/**
 * Schemas for Stagehand's `extract` — the fallback tier for reading a page.
 *
 * Everything here is a *second* attempt, never a first. The deterministic paths
 * come first in every case and are free:
 *
 *   form fields        DOM scan → accessibility tree → extract → vision
 *   confirmation id    labelled regex patterns       → extract
 *   validation errors  aria-invalid / .error nodes   → extract
 *
 * That ordering matters for more than cost. A regex that matched is *evidence*;
 * a model that read the page is an *opinion*. Where the cheap path produced an
 * answer, it wins — the model is only asked when we would otherwise have
 * nothing, and in the confirmation-ID case its answer is held to the same
 * `looksLikeId` scrutiny the regex output is, because a wrong reference shown
 * to a candidate as proof is worse than no reference at all.
 *
 * Schemas use `zod/v4`, which is what Stagehand v4 speaks. The app's own code
 * stays on the zod 3 API; these are the only v4 schemas in the codebase.
 */

import { z } from "zod/v4"

/**
 * A form control as a model would describe it.
 *
 * `kind` mirrors the vocabulary the field-handler registry dispatches on, so an
 * extracted field can be driven by exactly the same code as a DOM-scanned one.
 * Anything unrecognised becomes "text", which the catch-all handler drives.
 */
export const ExtractedFieldSchema = z.object({
  label: z.string().describe("The question exactly as shown to the applicant"),
  kind: z
    .enum(["text", "textarea", "select", "radio", "checkbox", "date", "typeahead", "file"])
    .describe("What kind of control answers this question"),
  required: z.boolean().describe("Whether the form marks this as required"),
  options: z
    .array(z.string())
    .describe("The choices offered, for select/radio/checkbox. Empty for free text."),
})

export const ExtractedFormSchema = z.object({
  fields: z.array(ExtractedFieldSchema),
})

export type ExtractedField = z.infer<typeof ExtractedFieldSchema>

/**
 * The receipt an ATS prints after a submission.
 *
 * `found` is separate from `id` on purpose. Asked for a string, a model will
 * produce one — an order number from a footer, a phone number, the date. An
 * explicit "did the page actually print a reference?" gives it somewhere to say
 * no, and gives us something to check before believing the answer.
 */
export const ConfirmationSchema = z.object({
  found: z.boolean().describe("True only if the page shows an application reference or confirmation number"),
  id: z.string().describe("The reference exactly as printed, or an empty string if there is none"),
  label: z.string().describe("What the page calls it, e.g. 'confirmation number'. Empty if none."),
})

/** Validation messages the form produced, as the applicant would read them. */
export const ValidationErrorsSchema = z.object({
  errors: z
    .array(
      z.object({
        field: z.string().describe("The label of the field being complained about, if identifiable"),
        message: z.string().describe("The error message as shown"),
      })
    )
    .describe("Only messages currently visible on the page. Empty when the form shows no errors."),
})

/**
 * Whether an application actually went through, read off the page.
 *
 * Used only where the rules layer is unsure. Deliberately mirrors the judge's
 * framing: the question is what the page *shows*, not what the run believes.
 */
export const SubmissionStateSchema = z.object({
  submitted: z.boolean().describe("True only if the page confirms the application was received"),
  evidence: z.string().describe("The exact wording on the page that shows this, or why it is unclear"),
})

/**
 * Normalise an extracted field into the inventory shape.
 *
 * The `key` is namespaced `x:` so it can never collide with a DOM-scanned key
 * (`id:`, `name:`, `idx:`) or an accessibility-tree one (`ax:`) — which matters
 * because the fill loop tracks completion by key, and a collision would mark
 * the wrong control done.
 */
export function toInventoryItem(f: ExtractedField, index: number): {
  key: string
  label: string
  kind: string
  required: boolean
  options: string[]
} {
  return {
    key: `x:${index}:${f.label.slice(0, 40)}`,
    label: f.label.replace(/\*+/g, "").trim(),
    kind: f.kind === "file" ? "file" : f.kind,
    required: !!f.required,
    options: Array.isArray(f.options) ? f.options.filter(Boolean) : [],
  }
}
