/**
 * Honeypot detection — the anti-bot fields a form *wants* left empty.
 *
 * A honeypot is an input the site hides from humans and watches for bots. Fill
 * one and the submission is flagged as automated, which is exactly the outcome
 * this codebase has already hit once on Ashby.
 *
 * `scanFormInventory` filters on `getBoundingClientRect()` plus display /
 * visibility / opacity. That catches the naive `display:none` honeypot and
 * nothing else. The techniques it misses are the common ones:
 *
 *   - positioned off-canvas (`left:-9999px`) — non-zero rect, fully "visible"
 *   - clipped to nothing (`clip-path:inset(100%)`, legacy `clip:rect(0,0,0,0)`)
 *   - a 1px or zero-size *ancestor* with `overflow:hidden` — the input's own
 *     rect is normal, the parent's is not
 *   - `tabindex="-1"` plus `autocomplete="off"` on a field with a bait name
 *   - a visually-hidden label saying "leave this field blank"
 *
 * Two halves, split so the decision is testable without a browser:
 * {@link HONEYPOT_PROBE} gathers the geometry facts in the VM, and
 * {@link isHoneypot} decides from them here.
 */

/** Facts read off a candidate control inside the VM. */
export interface HoneypotDescriptor {
  name: string | null
  id: string | null
  className: string | null
  type: string | null
  tabIndex: number | null
  autocomplete: string | null
  ariaHidden: boolean
  /** The control's own bounding rect. */
  rect: { width: number; height: number; top: number; left: number }
  /** Smallest ancestor rect within 4 levels — catches a clipped wrapper. */
  ancestorRect: { width: number; height: number } | null
  /** Whether the control or an ancestor within 4 levels clips to nothing. */
  clipped: boolean
  /** Whether an ancestor within 4 levels has overflow hidden AND is tiny. */
  hiddenOverflowAncestor: boolean
  /** Label/adjacent text, lowercased by the probe. */
  labelText: string | null
  /** Opacity of the control or nearest ancestor that sets one. */
  opacity: number
}

/**
 * Bait names ATSes and form libraries use. Matched as whole-ish tokens so a
 * legitimate "company_url" or "website" field is not caught — those are real
 * fields on plenty of applications.
 */
const BAIT_NAME_RE =
  /(^|[_\-\s])(honeypot|honey_pot|hp_field|bot[_-]?field|spam[_-]?trap|leave[_-]?blank|do[_-]?not[_-]?fill|fake[_-]?field|winnie[_-]?the[_-]?pooh|confirm[_-]?email[_-]?address[_-]?hp)($|[_\-\s])/i

/** Class names the same libraries use on the wrapper. */
const BAIT_CLASS_RE = /\b(honeypot|hp-field|visually-hidden-input|ohnohoney|nospam)\b/i

/** Instruction text that only ever appears on a honeypot. */
const BAIT_LABEL_RE = /leave (this|the) field (blank|empty)|do not fill (this|it) (in|out)|if you (are|'re) human,? (leave|skip)/i

/** Off-canvas threshold. Real fields are never positioned this far out. */
const OFFSCREEN_PX = -1000

export interface HoneypotVerdict {
  isHoneypot: boolean
  /** Why — logged so a false positive is diagnosable. */
  reason: string | null
}

/**
 * Decide whether a control is a honeypot.
 *
 * Deliberately conservative in one direction and not the other: skipping a real
 * field costs one unfilled input the audit gate will surface, while filling a
 * honeypot silently marks the whole application as bot traffic. So a single
 * strong signal is enough, but each signal is narrow.
 */
export function isHoneypot(d: HoneypotDescriptor): HoneypotVerdict {
  // A submit/button/hidden control is never a honeypot we'd fill anyway.
  if (d.type === "hidden" || d.type === "submit" || d.type === "button") {
    return { isHoneypot: false, reason: null }
  }

  if (d.name && BAIT_NAME_RE.test(d.name)) {
    return { isHoneypot: true, reason: `bait field name "${d.name}"` }
  }
  if (d.id && BAIT_NAME_RE.test(d.id)) {
    return { isHoneypot: true, reason: `bait field id "${d.id}"` }
  }
  if (d.className && BAIT_CLASS_RE.test(d.className)) {
    return { isHoneypot: true, reason: `honeypot class "${d.className.slice(0, 60)}"` }
  }
  if (d.labelText && BAIT_LABEL_RE.test(d.labelText)) {
    return { isHoneypot: true, reason: "label instructs that the field be left blank" }
  }

  // Positioned off-canvas but geometrically "visible".
  if (d.rect.left < OFFSCREEN_PX || d.rect.top < OFFSCREEN_PX) {
    return { isHoneypot: true, reason: `positioned off-canvas (${Math.round(d.rect.left)}, ${Math.round(d.rect.top)})` }
  }

  if (d.clipped) {
    return { isHoneypot: true, reason: "clipped to zero area by clip / clip-path" }
  }

  if (d.hiddenOverflowAncestor) {
    return { isHoneypot: true, reason: "sits inside a zero-size overflow:hidden wrapper" }
  }

  // Near-transparent. Anything under 0.05 is invisible to a person but passes
  // the existing `opacity !== '0'` string check.
  if (d.opacity < 0.05) {
    return { isHoneypot: true, reason: `effectively transparent (opacity ${d.opacity})` }
  }

  if (d.ariaHidden) {
    return { isHoneypot: true, reason: "aria-hidden — not exposed to assistive tech" }
  }

  // tabindex="-1" alone is legitimate on managed widgets, so it only counts
  // alongside autocomplete disabled and no reachable label.
  if (d.tabIndex === -1 && d.autocomplete === "off" && !d.labelText) {
    return { isHoneypot: true, reason: "unfocusable, autocomplete off, and unlabelled" }
  }

  return { isHoneypot: false, reason: null }
}

/**
 * The VM-side probe that produces a {@link HoneypotDescriptor}.
 *
 * Defined as a function body string so it can be inlined into the existing
 * inventory scan rather than costing a second `playwright.execute` round-trip.
 * Expects `el` in scope; evaluates to the descriptor object.
 */
export const HONEYPOT_PROBE = `
(() => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);

  const clipsToNothing = (s) => {
    const cp = s.clipPath || s.webkitClipPath || '';
    if (/inset\\(\\s*(100%|50%\\s+50%)/.test(cp)) return true;
    const clip = s.clip || '';
    return /rect\\(\\s*0(px)?[,\\s]+0(px)?[,\\s]+0(px)?[,\\s]+0(px)?\\s*\\)/.test(clip);
  };

  let clipped = clipsToNothing(cs);
  let hiddenOverflowAncestor = false;
  let ancestorRect = null;
  let opacity = parseFloat(cs.opacity || '1');

  let node = el.parentElement;
  for (let i = 0; node && i < 4; i++, node = node.parentElement) {
    const acs = getComputedStyle(node);
    const ar = node.getBoundingClientRect();
    if (!ancestorRect || ar.width * ar.height < ancestorRect.width * ancestorRect.height) {
      ancestorRect = { width: ar.width, height: ar.height };
    }
    if (clipsToNothing(acs)) clipped = true;
    const o = parseFloat(acs.opacity || '1');
    if (!isNaN(o) && o < opacity) opacity = o;
    if (/hidden|clip/.test(acs.overflow) && (ar.width <= 1 || ar.height <= 1)) {
      hiddenOverflowAncestor = true;
    }
  }

  const labelEl = (el.id && document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]')) || el.closest('label');
  const ti = el.getAttribute('tabindex');

  return {
    name: el.getAttribute('name'),
    id: el.id || null,
    className: typeof el.className === 'string' ? el.className : null,
    type: (el.getAttribute('type') || '').toLowerCase() || null,
    tabIndex: ti === null ? null : parseInt(ti, 10),
    autocomplete: (el.getAttribute('autocomplete') || '').toLowerCase() || null,
    ariaHidden: el.getAttribute('aria-hidden') === 'true',
    rect: { width: r.width, height: r.height, top: r.top, left: r.left },
    ancestorRect,
    clipped,
    hiddenOverflowAncestor,
    labelText: labelEl ? (labelEl.textContent || '').replace(/\\s+/g, ' ').trim().toLowerCase().slice(0, 160) : null,
    opacity: isNaN(opacity) ? 1 : opacity,
  };
})()
`
