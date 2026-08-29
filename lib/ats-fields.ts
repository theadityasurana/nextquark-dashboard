/**
 * ATS field taxonomy — what kinds of controls each provider actually renders,
 * and how to read and drive them.
 *
 * Compiled from each provider's own documentation (see SOURCES at the bottom).
 * The point of this module is that "fill the form" is not one problem: each ATS
 * has a fixed, documented set of field types, and each type needs a different
 * interaction. Typing text into a date picker or asking a model to tick a
 * checkbox fails silently — which is exactly what was happening.
 *
 * Pure and DOM-free so the classification is unit-testable; the DOM work that
 * uses these tables lives in kernel.ts's VM handlers.
 */

/** The interaction a control needs, independent of which ATS renders it. */
export type WidgetKind =
  | "text"
  | "longtext"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "file"
  | "checkbox"
  | "consent"
  | "radio"
  | "select"
  | "multiselect"
  | "typeahead"
  | "hidden"

/**
 * Greenhouse job board API field types → widget kind.
 * Greenhouse aggregates multiple `fields` under one `question`; the résumé
 * question is the canonical example, exposing both input_file and textarea.
 */
export const GREENHOUSE_TYPE_MAP: Record<string, WidgetKind> = {
  input_text: "text",
  input_file: "file",
  input_hidden: "hidden",
  textarea: "longtext",
  multi_value_single_select: "select",
  multi_value_multi_select: "multiselect",
}

/** Ashby application form field types → widget kind. */
export const ASHBY_TYPE_MAP: Record<string, WidgetKind> = {
  String: "text",
  LongText: "longtext",
  Email: "email",
  Phone: "phone",
  Number: "number",
  Score: "number",
  Date: "date",
  File: "file",
  Boolean: "checkbox",
  ValueSelect: "select",
  MultiValueSelect: "multiselect",
  SocialLink: "url",
}

/**
 * Lever's apply form. Lever's postings API explicitly does NOT expose custom
 * questions, so custom fields must be read from the DOM — only the standard
 * fields below are known ahead of time.
 */
export const LEVER_STANDARD_FIELDS: Record<string, WidgetKind> = {
  name: "text",
  email: "email",
  phone: "phone",
  org: "text",
  resume: "file",
  comments: "longtext",
  "urls[LinkedIn]": "url",
  "urls[GitHub]": "url",
  "urls[Portfolio]": "url",
  "consent.marketing": "checkbox",
  "consent.store": "consent",
}

/**
 * Option-row selectors, per portal.
 *
 * Workday is the reason this is portal-aware: its combobox options are
 * `[data-automation-id="promptOption"]` nodes that carry NO `role="option"`, so
 * a role-only query returns zero options and the dropdown looks empty.
 */
export const OPTION_SELECTORS: Record<string, string> = {
  Workday:
    '[role="option"], [data-automation-id="promptOption"], [data-automation-id="menuItem"]',
  Greenhouse:
    '[role="option"], .select__option, [class*="select__option"], ul[role="listbox"] li',
  Ashby: '[role="option"], [class*="_option"], ul[role="listbox"] li',
  Lever: '[role="option"], .application-dropdown option, ul[role="listbox"] li',
  SmartRecruiters: '[role="option"], li[class*="option"]',
  iCIMS: '[role="option"], .iCIMS_Dropdown option, ul[role="listbox"] li',
  Jobvite: '[role="option"], ul[role="listbox"] li',
  BambooHR: '[role="option"], [class*="chosen-result"], ul[role="listbox"] li',
  LinkedIn: '[role="option"], .basic-typeahead__triggered-content li',
}

/** Fallback used when the portal isn't recognized. */
export const DEFAULT_OPTION_SELECTOR =
  '[role="option"], ul[role="listbox"] li, [class*="option"]:not([class*="options"]), [class*="menu"] li, [class*="suggestion"]'

export function optionSelectorFor(portal: string | null | undefined): string {
  return OPTION_SELECTORS[portal || ""] || DEFAULT_OPTION_SELECTOR
}

/**
 * Providers whose apply form lives at a different URL from the posting page.
 * Landing on the posting page yields a form with zero fields, which audits as
 * "all required fields filled" — a false success.
 */
export const APPLY_PATH_SUFFIX: Record<string, string> = {
  Ashby: "/application",
  Lever: "/apply",
}

/**
 * Providers that do NOT server-validate required fields on submit.
 *
 * Greenhouse's job board API documentation states plainly that it "will not
 * confirm the inclusion of required fields" and that validation must be done
 * client-side. So a submit can be accepted with mandatory answers missing — our
 * own pre-submit audit is the only gate, and it has to be trusted accordingly.
 */
export const CLIENT_SIDE_VALIDATION_ONLY = new Set(["Greenhouse"])

/**
 * Question groups that appear alongside the main question list and are easy to
 * miss because they render in separate sections of the page.
 */
export const QUESTION_SECTIONS = [
  "questions", // custom, job-specific
  "location_questions", // applicant location
  "compliance", // EEOC (US)
  "demographic_questions", // Greenhouse Inclusion
  "data_compliance", // GDPR consent + retention
] as const

/**
 * Map a provider's documented field type to a widget kind.
 * Unknown types fall back to "text", which is the safe default: typing into a
 * control that wanted a click fails visibly, whereas the reverse can mis-click.
 */
export function classifyAtsType(portal: string | null | undefined, rawType: string): WidgetKind {
  if (!rawType) return "text"
  if (portal === "Greenhouse") return GREENHOUSE_TYPE_MAP[rawType] ?? "text"
  if (portal === "Ashby") return ASHBY_TYPE_MAP[rawType] ?? "text"
  // Other providers don't publish a type enum; fall back to name-shape matching.
  const t = rawType.toLowerCase()
  if (/file|resume|cv|attach/.test(t)) return "file"
  if (/textarea|long|paragraph/.test(t)) return "longtext"
  if (/email/.test(t)) return "email"
  if (/phone|tel/.test(t)) return "phone"
  if (/date|calendar/.test(t)) return "date"
  if (/multi.*select|checkbox(es)?/.test(t)) return "multiselect"
  if (/select|dropdown|choice/.test(t)) return "select"
  if (/radio|yes.?no|bool/.test(t)) return "radio"
  if (/url|link/.test(t)) return "url"
  if (/number|score|integer/.test(t)) return "number"
  return "text"
}

/**
 * Whether a widget is driven by clicking rather than typing. These are the
 * kinds that previously had no handler and fell through to the model.
 */
export function isClickDriven(kind: WidgetKind): boolean {
  return (
    kind === "checkbox" ||
    kind === "consent" ||
    kind === "radio" ||
    kind === "select" ||
    kind === "multiselect"
  )
}

/** Whether a control should never be written to. */
export function isSkippable(kind: WidgetKind): boolean {
  return kind === "hidden"
}

/*
 * SOURCES
 * -------
 * Greenhouse Job Board API — question/field types, question sections, and the
 *   client-side-validation note:
 *   https://developers.greenhouse.io/job-board.html
 *   https://github.com/grnhse/greenhouse-api-docs/blob/master/source/includes/job-board/_jobs.md
 * Ashby — application form field types and form field definition shape:
 *   https://developers.ashbyhq.com/docs/creating-a-custom-careers-page
 *   https://docs.ashbyhq.com/application-forms
 * Lever Postings API — standard apply fields; custom questions NOT exposed:
 *   https://github.com/lever/postings-api/blob/master/README.md
 * SmartRecruiters Application API — DIVERSITY compliance type, privacy consent:
 *   https://developers.smartrecruiters.com/docs/application-api-1
 * Workday — promptOption / ARIA widget behaviour observed in Workday Canvas
 *   Select & MultiSelect and in published Workday autofill implementations:
 *   https://canvas.workday.com/components/inputs/select
 *   https://canvas.workday.com/components/inputs/multiselect
 * iCIMS — required fields marked with an asterisk:
 *   https://community.icims.com/s/article/Candidate-Guide-to-the-iCIMS-Talent-Platform
 */
