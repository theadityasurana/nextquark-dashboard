/**
 * Accessibility-tree form scan — a cheaper, more reliable second pass than
 * screenshotting the page and asking a vision model what it sees.
 *
 * `visionScanForm` exists because DOM traversal misses widgets with no backing
 * `<input>`: Workday's div-radios, Ashby's `aria-pressed` toggles, iCIMS custom
 * grids. That's the right problem to solve, but a vision call per run is an
 * expensive way to solve it — and the model has to infer from pixels what the
 * browser already knows exactly.
 *
 * The accessibility tree *is* that knowledge. Every one of those widgets is
 * required to expose a correct `role` and `name` to assistive technology, or it
 * would be unusable by a screen reader — and unlike a screenshot, the tree
 * gives us the element's identity, not just its appearance.
 *
 * The reconciliation trick is jobber's: inject a numeric `mmid` attribute into
 * every element *and* mirror it into `aria-keyshortcuts`, which the CDP
 * accessibility tree surfaces verbatim. That gives every AX node a key back to
 * its DOM element, so a node the DOM scan missed can still be located, labelled
 * and driven.
 *
 * Sequencing in the pipeline: DOM scan → AX scan → vision only if required-
 * looking regions remain unexplained. Vision stays as the safety net; it just
 * stops being the default.
 */

import { VM_DOM_HELPERS } from "./vm-dom"

/** A control discovered through the accessibility tree. */
export interface AxField {
  key: string
  label: string
  kind: string
  required: boolean
  options: string[]
  /** Present value, when the node exposes one. */
  value?: string
  /** Checked/selected state for toggle-like roles. */
  checked?: boolean
}

/**
 * AX roles that represent something a person fills in. Anything outside this
 * set is structural and ignored — otherwise every heading and list item on a
 * long job description arrives as a "field".
 */
const INTERACTIVE_ROLES = new Set([
  "textbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "radiogroup",
  "switch",
  "slider",
  "spinbutton",
  "searchbox",
  "menuitemcheckbox",
  "menuitemradio",
])

/** Map an ARIA role onto the widget vocabulary the field handlers speak. */
export function kindForRole(role: string, hasOptions: boolean): string {
  switch (role) {
    case "checkbox":
    case "switch":
    case "menuitemcheckbox":
      return "checkbox"
    case "radio":
    case "radiogroup":
    case "menuitemradio":
      return "radio"
    case "combobox":
      return hasOptions ? "select" : "typeahead"
    case "listbox":
      return "select"
    case "spinbutton":
    case "slider":
      return "text"
    case "searchbox":
    case "textbox":
    default:
      return "text"
  }
}

/** Whether an AX node is worth surfacing as a fillable control. */
export function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role)
}

/**
 * The VM program: inject ids, pull the full AX tree over CDP, and return the
 * interactive nodes with their DOM-side identity attached.
 *
 * Runs entirely inside the Kernel VM, where `page` is a real Playwright Page
 * and `page.context().newCDPSession(page)` is available — the local CDP proxy
 * we hold in this process is not a full Page and cannot do this.
 *
 * `aria-keyshortcuts` is deliberately hijacked: it is the one property that
 * appears in the AX tree unmodified and is almost never used by real forms. Any
 * pre-existing value is preserved under `orig-aria-keyshortcuts` and restored,
 * so the page is left exactly as it was found.
 */
export const AX_SCAN_CODE = `
// 1. Tag every element with a numeric id, mirrored into an AX-visible property.
const injected = await page.evaluate(() => {
  let id = 0;
  const all = document.querySelectorAll('body *');
  for (const el of all) {
    const mmid = String(++id);
    el.setAttribute('data-nq-mmid', mmid);
    const existing = el.getAttribute('aria-keyshortcuts');
    if (existing !== null) el.setAttribute('data-nq-orig-keyshortcuts', existing);
    el.setAttribute('aria-keyshortcuts', mmid);
  }
  return id;
});

// 2. Read the accessibility tree.
let nodes = [];
try {
  const cdp = await page.context().newCDPSession(page);
  const tree = await cdp.send('Accessibility.getFullAXTree');
  nodes = tree.nodes || [];
  await cdp.detach().catch(() => {});
} catch (e) {
  nodes = [];
}

// 3. Give back the aria attribute we hijacked — leaving that behind would
//    change what a screen reader announces and can break the real form.
//
//    data-nq-mmid is deliberately KEPT. It is an inert data attribute, and it is
//    the only handle an AX-discovered control has: stripping it made every
//    "ax:" key unresolvable, so any field found ONLY by this scan could never be
//    filled — it just became a permanent blocker at the submit gate.
await page.evaluate(() => {
  for (const el of document.querySelectorAll('[data-nq-mmid]')) {
    const orig = el.getAttribute('data-nq-orig-keyshortcuts');
    if (orig !== null) { el.setAttribute('aria-keyshortcuts', orig); el.removeAttribute('data-nq-orig-keyshortcuts'); }
    else el.removeAttribute('aria-keyshortcuts');
  }
});

// 4. Reduce the tree to interactive nodes, keyed back to their DOM element.
const INTERACTIVE = ${JSON.stringify([...INTERACTIVE_ROLES])};
const prop = (n, name) => {
  const p = (n.properties || []).find(x => x.name === name);
  return p ? p.value && p.value.value : undefined;
};
const out = [];
const axNodes = [];
for (const n of nodes) {
  if (n.ignored) continue;
  const role = n.role && n.role.value;
  if (!role || !INTERACTIVE.includes(role)) continue;
  const mmid = prop(n, 'keyshortcuts');
  if (!mmid) continue;
  const name = (n.name && n.name.value ? String(n.name.value) : '').replace(/\\s+/g, ' ').trim();
  if (!name) continue;
  axNodes.push({ n, role, mmid: String(mmid), name });
}

// Resolve each AX node back to its element so it can carry the SAME key and the
// SAME label the DOM scan would give it. Without this, the accessibility tree
// reports Ashby's location combobox as "Start typing…" (its placeholder) while
// the DOM scan calls it "Where are you currently located?" — two names for one
// control, which de-duplicated as two separate questions.
const resolved = await page.evaluate((items) => {
${VM_DOM_HELPERS}
  return items.map((it) => {
    const el = document.querySelector('[data-nq-mmid="' + it.mmid + '"]');
    if (!el) return { mmid: it.mmid, domKey: null, domLabel: null };
    return { mmid: it.mmid, domKey: nqKeyOf(el), domLabel: nqLabelOf(el) };
  });
}, axNodes.map((a) => ({ mmid: a.mmid })));
const byMmid = new Map(resolved.map((r) => [r.mmid, r]));

for (const a of axNodes) {
  const n = a.n, role = a.role, mmid = a.mmid, name = a.name;
  const r = byMmid.get(mmid) || {};
  out.push({
    mmid: String(mmid),
    domKey: r.domKey || null,
    domLabel: r.domLabel || null,
    role,
    name: name.slice(0, 160),
    required: prop(n, 'required') === true,
    disabled: prop(n, 'disabled') === true,
    hidden: prop(n, 'hidden') === true,
    checked: prop(n, 'checked'),
    value: n.value && n.value.value != null ? String(n.value.value).slice(0, 200) : undefined,
    description: n.description && n.description.value ? String(n.description.value).slice(0, 160) : undefined,
  });
}
return { injected, total: nodes.length, fields: out };
`

/** Raw shape returned by {@link AX_SCAN_CODE}. */
export interface RawAxNode {
  mmid: string
  /** The element's key as the DOM scanner would compute it, when resolvable. */
  domKey?: string | null
  /** The element's label as the DOM scanner would resolve it. */
  domLabel?: string | null
  role: string
  name: string
  required?: boolean
  disabled?: boolean
  hidden?: boolean
  checked?: unknown
  value?: string
  description?: string
}

/**
 * Turn raw AX nodes into inventory items, dropping anything already covered by
 * the DOM scan.
 *
 * De-duplication is by normalized label rather than by key, because the two
 * scans identify the same control differently by construction — the DOM scan
 * keys on `id`/`name`, the AX scan on an injected ordinal. Label is the only
 * identity they share.
 */
export function mergeAxFields(
  raw: RawAxNode[],
  domInventory: Array<{ key?: string; label: string; options?: string[] }>
): AxField[] {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()

  // ─── De-duplicate by ELEMENT, not by name ───
  //
  // The accessibility tree names a control by its accessible name, which for a
  // combobox with no label is its placeholder. Ashby's location field is
  // "Where are you currently located?" to the DOM scan and "Start typing…" to
  // the AX tree — the same element under two names, which the old name-only
  // comparison happily added twice. The second copy carried a placeholder for a
  // question and an unresolvable key, so it could never be filled and blocked
  // the submit gate forever.
  const knownKeys = new Set(domInventory.map((i) => i.key).filter(Boolean) as string[])
  const knownLabels = new Set(domInventory.map((i) => normalize(i.label)).filter(Boolean))

  // ─── An option is not a question ───
  //
  // A radio group is ONE inventory item keyed group:<name>, but each member radio
  // is its own node in the accessibility tree, named after the option it carries.
  // Neither dedupe above catches them: the member's own key is id:<uuid> rather
  // than the group key, and "Yes" is nobody's question label.
  //
  // So an Ashby form with three Yes/No questions produced two extra "fields"
  // called "Yes" and "No" — with no value to give them and no question behind
  // them — while the three real questions went unanswered.
  const knownOptions = new Set(
    domInventory.flatMap((i) => (i.options ?? []).map(normalize)).filter(Boolean)
  )
  const seen = new Set<string>()
  const out: AxField[] = []

  for (const n of raw) {
    if (n.disabled || n.hidden) continue
    if (!isInteractiveRole(n.role)) continue

    // Prefer the label the DOM resolver produced: it reads the real question,
    // where the AX name often reads the placeholder.
    const label = (n.domLabel || n.name).replace(/[*✱＊]+/g, "").trim()
    const norm = normalize(label)
    if (!norm) continue

    // Already covered by the DOM scan, under either identity.
    if (n.domKey && knownKeys.has(n.domKey)) continue
    if (knownLabels.has(norm)) continue
    if (knownOptions.has(norm)) continue
    if (seen.has(norm)) continue
    seen.add(norm)

    out.push({
      // A key that resolves to a real element wins. `ax:` is the fallback and
      // now resolves too, because data-nq-mmid is left on the page.
      key: n.domKey || `ax:${n.mmid}`,
      label,
      kind: kindForRole(n.role, false),
      required: !!n.required,
      options: [],
      value: n.value,
      checked: typeof n.checked === "boolean" ? n.checked : n.checked === "true",
    })
  }
  return out
}

/**
 * Whether a vision scan is still worth paying for after DOM + AX.
 *
 * The case vision uniquely catches is a form that visibly asks for things but
 * exposes almost nothing programmatically — a canvas-rendered or heavily
 * div-based widget set. If DOM and AX together found a plausible number of
 * controls, another model call buys nothing.
 */
export function needsVisionFallback(domCount: number, axCount: number, requiredCount: number): boolean {
  const total = domCount + axCount
  // Nothing found at all — either the form hasn't rendered or it's fully custom.
  if (total === 0) return true
  // A form with no required field anywhere is suspicious: almost every real
  // application marks at least one. Likely the markup hides its semantics.
  if (requiredCount === 0 && total < 6) return true
  return false
}
