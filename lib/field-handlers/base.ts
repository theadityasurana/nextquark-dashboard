/**
 * Field handler contract — the Strategy pattern, adapted for remote execution.
 *
 * Replaces a single ~300-line VM code string with an if/else chain that had
 * grown by patching and could not be tested. Each widget type is now its own
 * handler with two independently-testable halves:
 *
 *   canHandle(descriptor) → boolean      pure; testable with no browser
 *   vmCode(ctx)           → string       the JS that actually drives the widget
 *
 * The dispatcher picks the FIRST handler whose `canHandle` returns true, in
 * priority order, then runs only that handler's code in the VM. Adding a widget
 * type means adding a file, not editing a monolith.
 *
 * The split matters because the DOM work has to run inside the Kernel VM (the
 * CDP page proxy we hold locally is not a full Playwright Page), while the
 * *decision* about which handler applies is pure logic that belongs in tests.
 */

/** Attributes read off a control in the VM and passed back for classification. */
export interface ElementDescriptor {
  tag: string
  type: string | null
  role: string | null
  id: string | null
  name: string | null
  className: string | null
  autocomplete: string | null
  placeholder: string | null
  ariaLabel: string | null
  ariaAutocomplete: string | null
  ariaHasPopup: string | null
  ariaControls: string | null
  dataAutomationId: string | null
  /** True for <select multiple>. */
  multiple: boolean
  /** Visible label. Used only where attributes can't decide. */
  label: string | null
  /** Whether an ancestor/wrapper looks like a date or calendar container. */
  inDateContainer: boolean
}

/** Everything a handler's generated code needs. */
export interface HandlerContext {
  /** Stable element key (`id:…`, `name:…`, `idx:…`) used to re-find the node. */
  fieldKey: string
  /** Display label, for prompts and logs. */
  label: string
  /** The value to enter. For pipe-separated dates, the handler splits it. */
  value: string
  /** Portal-specific option-row selector (Workday needs promptOption). */
  optionSelector: string
  /** The attribute this handler tags its target with. */
  targetAttr: string
}

export interface FieldHandler {
  /** Stable identifier, used in logs and tests. */
  readonly name: string
  /**
   * Priority — LOWER runs first. Specific handlers must outrank generic ones,
   * or `text` would swallow every control on the page.
   */
  readonly priority: number
  /** Pure predicate: can this handler drive this control? */
  canHandle(d: ElementDescriptor): boolean
  /** The JS executed in the VM. Must return an object with at least `filled`. */
  vmCode(ctx: HandlerContext): string
}

/** Outcome of one handler run. */
export interface HandlerResult {
  handled: boolean
  filled: boolean
  handler: string
  reason: string
  picked?: string
  /** Options the widget actually offered — the key diagnostic on a mismatch. */
  options?: string[]
  /** Set when the handler needs the model to choose from `options`. */
  needsModelChoice?: boolean
  /**
   * The label read back off the element we actually resolved.
   *
   * A field key is captured during the scan and used a few seconds later to
   * re-find the node. In between, React can re-render and reorder the form —
   * and an `idx:`-keyed lookup then resolves to a DIFFERENT control with the
   * same position. Writing at that point puts the phone number in the name box.
   */
  resolvedLabel?: string
  /**
   * Set when `resolvedLabel` does not match the label we planned an answer for.
   * Nothing is written when this is true.
   */
  labelMismatch?: boolean
}

/**
 * Shared VM helpers, prepended to every handler's code.
 *
 * `readState` is the one that matters: a native checkbox exposes `.checked`,
 * but an ARIA widget carries its state in `aria-checked` / `aria-selected`.
 * Reading only `.checked` reported every ARIA control as unchecked forever.
 */
export const VM_PRELUDE = `
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

function normOpt(s) {
  return (s || '').normalize('NFKD').replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function bestIndex(want, labels) {
  const w = normOpt(want);
  if (!w) return -1;
  const n = labels.map(normOpt);
  let i = n.indexOf(w); if (i >= 0) return i;
  // Yes/No matches on the leading token so "No" never selects "Norway".
  if (w === 'yes' || w === 'no') return n.findIndex(x => x.split(' ')[0] === w);
  i = n.findIndex(x => x && (x.startsWith(w) || w.startsWith(x))); if (i >= 0) return i;
  i = n.findIndex(x => x && (x.includes(w) || w.includes(x))); if (i >= 0) return i;
  const toks = w.split(' ').filter(Boolean);
  i = n.findIndex(x => x && toks.every(t => x.includes(t)));
  if (i >= 0) return i;

  // ── Place names, allowing for renamed cities ──
  //
  // "Bangalore, India" against "Bengaluru, Karnataka, India" shares only the
  // country, so every check above fails and the suggestion is never clicked.
  // Requiring a shared CITY token — under any of its spellings — plus agreement
  // on the rest is enough to match confidently without matching a wrong city.
  if (typeof nqCityAliases === 'function') {
    const wantVariants = new Set();
    for (const t of toks) for (const v of nqCityAliases(t)) wantVariants.add(v);
    i = n.findIndex(x => {
      if (!x) return false;
      const xToks = x.split(' ').filter(Boolean);
      return xToks.some(t => wantVariants.has(t));
    });
    if (i >= 0) return i;
  }
  return -1;
}

function readState(el) {
  if (!el) return false;
  if (typeof el.checked === 'boolean') return el.checked;
  const a = el.getAttribute('aria-checked') || el.getAttribute('aria-selected');
  return a === 'true';
}

// ─── DOM-mutation feedback ───
//
// Every async widget here used to be driven by a fixed sleep: type, wait 1400ms,
// look for options. That is wrong in both directions — it is dead time on a fast
// form, and it gives up early on a slow one. Worse, it collapses two very
// different outcomes into one: "the listbox rendered and had nothing matching"
// and "the listbox never rendered at all" both look like "no options found",
// so the retry logic could not tell a bad query from a broken widget.
//
// A MutationObserver answers the question directly. waitForMutation resolves
// as soon as the page actually changes, and reports whether it changed at all —
// which becomes the 'reason' a handler returns on failure.
let __nqMutations = 0;
let __nqObserver = null;

function ensureObserver() {
  if (__nqObserver) return;
  try {
    __nqObserver = new MutationObserver((records) => {
      for (const r of records) {
        // Only count changes that could plausibly be a widget responding:
        // added/removed nodes, or an aria/visibility attribute flipping.
        if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) { __nqMutations++; continue; }
        if (r.type === 'attributes') {
          const n = r.attributeName || '';
          if (/^(aria-|class|style|hidden|data-)/.test(n)) __nqMutations++;
        }
      }
    });
    __nqObserver.observe(document.body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'aria-checked', 'aria-selected', 'aria-activedescendant'],
    });
  } catch { __nqObserver = null; }
}

/**
 * Wait until the DOM changes, or until timeoutMs elapses.
 *
 * Returns { changed, waitedMs }. changed:false after a full timeout is a real
 * signal, not just a slow page: the widget did not react to what we did.
 * settleMs lets a burst of mutations finish before we read the result — an
 * async listbox arrives as many small mutations, and reading after the first
 * one sees a half-rendered list.
 */
async function waitForMutation(timeoutMs, settleMs) {
  ensureObserver();
  const start = Date.now();
  const deadline = start + (timeoutMs || 2000);
  const settle = settleMs == null ? 250 : settleMs;
  const before = __nqMutations;

  while (Date.now() < deadline) {
    await sleep(60);
    if (__nqMutations > before) {
      // Something moved. Let the burst finish before returning.
      let last = __nqMutations;
      const settleUntil = Date.now() + settle;
      while (Date.now() < settleUntil) {
        await sleep(50);
        if (__nqMutations !== last) { last = __nqMutations; }
      }
      return { changed: true, waitedMs: Date.now() - start };
    }
  }
  return { changed: false, waitedMs: Date.now() - start };
}

// Clicking a visually-hidden <input> throws "label intercepts pointer events".
// The label is the real click target on almost every styled control, so it is
// tried FIRST and the raw input is the fallback — not the other way round.
function clickVia(el) {
  if (!el) return false;
  try {
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    const lbl = (el.id && document.querySelector('label[for="' + esc(el.id) + '"]')) || el.closest('label');
    if (lbl) { lbl.click(); return true; }
    el.click();
    return true;
  } catch { return false; }
}
`
