/**
 * One definition of "how we identify and label a form control", shared by every
 * VM script.
 *
 * Until now the scanner, the auditor, the filler and the verifier each carried
 * their own copy of this logic, and they had drifted apart. That is not a tidiness
 * complaint — it produced real, expensive bugs:
 *
 *   · The scanner's wrapper selector included `[class*="input"]`, so on Ashby it
 *     stopped at a wrapper holding no label and fell through to the placeholder.
 *     Every question came back named "Start typing…" or "Pick date…", while the
 *     filler's copy resolved the same elements correctly. The mismatch guard then
 *     fired on every field and the run stalled at 6/9.
 *
 *   · Keys fell back to `idx:N`, a position in a live NodeList. React re-renders
 *     between the scan and the fill, the list reorders, and `idx:7` is suddenly a
 *     different control — which is how a date got picked twice and a value nearly
 *     landed in the wrong box.
 *
 * Both classes of bug are structural: they exist because there was more than one
 * answer to the same question. This module is the single answer, injected as a
 * prelude into every script that touches a control.
 */

/**
 * Shared helpers, as a JS source string for `page.evaluate`.
 *
 * All names are `nq`-prefixed so they cannot collide with page globals.
 */
export const VM_DOM_HELPERS = `
/**
 * Cities that were officially renamed but are still written both ways.
 *
 * A candidate's profile says "Bangalore, India"; every place-autocomplete on a
 * job form returns "Bengaluru, Karnataka, India". Token matching finds nothing
 * in common beyond "India", so the suggestion is never clicked — the typed text
 * is left sitting in the box, the hidden lat/long companions stay empty, and the
 * form rejects a submission that looked correct on screen.
 */
const NQ_CITY_ALIASES = [
  ['bangalore', 'bengaluru'],
  ['bombay', 'mumbai'],
  ['calcutta', 'kolkata'],
  ['madras', 'chennai'],
  ['poona', 'pune'],
  ['gurgaon', 'gurugram'],
  ['baroda', 'vadodara'],
  ['trivandrum', 'thiruvananthapuram'],
  ['mysore', 'mysuru'],
  ['cochin', 'kochi'],
  ['pondicherry', 'puducherry'],
  ['new york city', 'new york', 'nyc'],
  ['san francisco', 'sf', 'san francisco bay area'],
  ['washington dc', 'washington d c', 'district of columbia'],
  ['bengaluru urban', 'bengaluru'],
];

/** Every spelling of a place name, so either side of a rename matches. */
function nqCityAliases(token) {
  const out = new Set([token]);
  for (const group of NQ_CITY_ALIASES) {
    if (group.includes(token)) for (const g of group) out.add(g);
  }
  return out;
}
const nqClean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
const nqEsc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);

/** Visible to a human: has a box, is not display:none/hidden/transparent. */
function nqIsVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
  return (r.width > 0 || r.height > 0);
}

/**
 * Present in the DOM but not something a person can fill.
 *
 * react-select renders a sentinel behind every empty required dropdown:
 *   <input required tabindex="-1" aria-hidden="true" style="opacity:0;position:absolute;left:0;right:0">
 * It is stretched edge to edge, so it has width and passes a naive visibility
 * test — and it was being reported as an unfilled required field, labelled from
 * whatever wrapper happened to enclose it.
 */
function nqIsGhost(el) {
  if (!el) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.getAttribute('tabindex') === '-1' && el.tagName === 'INPUT') return true;
  const s = getComputedStyle(el);
  if (s.opacity === '0' || s.pointerEvents === 'none') return true;
  if (el.closest('[aria-hidden="true"]')) return true;
  return false;
}

/**
 * Controls that belong to the portal's chrome rather than to the application:
 * résumé-autofill panes, cookie banners, site search.
 */
function nqIsDecoy(el) {
  return !!(el.closest && el.closest(
    '[class*="autofill"],[class*="auto-fill"],[class*="resume-parser"],[class*="cookie"],' +
    '[class*="consent-banner"],[role="search"],[class*="search-bar"],[class*="navbar"],[class*="header"]'
  ));
}

/**
 * Is this node inside an OPEN calendar / listbox popup?
 *
 * A popup's internals are not new questions. react-datepicker renders month and
 * year <select>s inside its dropdown, and those were being scanned as two extra
 * required fields on the page — which is why a date field appeared twice and got
 * answered twice.
 */
function nqInPopup(el) {
  return !!(el.closest && el.closest(
    '[class*="datepicker"],[class*="date-picker"],[class*="calendar"],[role="dialog"],' +
    '[role="listbox"],[class*="menu-portal"],[class*="popover"],[class*="tooltip"]'
  ));
}

/** Container text minus any option/menu content that happens to be rendered. */
function nqTextWithoutOptions(node) {
  if (!node) return '';
  try {
    const copy = node.cloneNode(true);
    copy.querySelectorAll(
      '[role="option"],[role="listbox"],[role="menu"],option,datalist,' +
      '[class*="option"],[class*="menu"],[class*="dropdown"],[class*="suggestion"],[class*="listbox"]'
    ).forEach((n) => n.remove());
    return nqClean(copy.textContent);
  } catch {
    return nqClean(node.textContent);
  }
}

/**
 * The wrapper that holds a control's label.
 *
 * "[class*=input]" is deliberately absent. closest() stops at the NEAREST
 * match, so a wrapper named after the input swallows the search before it
 * reaches the one carrying the label — which is precisely what broke Ashby,
 * where the control sits in "ashby-application-form-input" and the label lives
 * one level out in "ashby-application-form-field-entry".
 */
const NQ_WRAPPER_SELECTOR = '[class*="field"],[class*="question"],[class*="form-group"],[class*="form-row"],[class*="entry"],fieldset,li';

function nqWrapperOf(el) {
  if (!el || !el.closest) return null;
  // Walk OUTWARDS until we reach a container that actually holds a label.
  //
  // A single closest() call is not enough, because every ATS nests a
  // label-less inner wrapper inside the labelled one, and closest() stops at
  // the first match:
  //
  //   Ashby   .ashby-application-form-input   <  .ashby-application-form-field-entry (label)
  //   Lever   .application-field              <  li.application-question           (label)
  //   GH      .select-shell                   <  .field-entry                      (label)
  //
  // Stopping at the inner one returns an empty label, and the scanner then falls
  // through to the placeholder — which is how every Ashby question came back
  // named "Start typing…" or "Pick date…".
  let node = el.parentElement;
  let fallback = null;
  for (let hops = 0; node && hops < 6; hops++, node = node.parentElement) {
    if (!node.matches || !node.matches(NQ_WRAPPER_SELECTOR)) continue;
    if (!fallback) fallback = node;
    const lbl = node.querySelector('label,legend,[class*="label"]');
    if (lbl && nqTextWithoutOptions(lbl)) return node;
  }
  return fallback;
}

/** Resolve a control's label the way a screen reader would, most authoritative first. */
function nqLabelOf(el) {
  if (!el) return '';
  const aria = nqClean(el.getAttribute && el.getAttribute('aria-label'));
  if (aria) return aria.slice(0, 160);

  // Greenhouse stamps the full, untruncated question onto every member of a
  // checkbox group as a "description" attribute. It is the most reliable label
  // on the page and costs nothing to read.
  const desc = nqClean(el.getAttribute && el.getAttribute('description'));
  if (desc) return desc.slice(0, 160);

  const by = el.getAttribute && el.getAttribute('aria-labelledby');
  if (by) {
    const t = nqClean(by.split(/\\s+/).map((id) => {
      try { return (document.getElementById(id) || {}).textContent || ''; } catch { return ''; }
    }).join(' '));
    if (t) return t.slice(0, 160);
  }

  if (el.id) {
    try {
      const forLabel = document.querySelector('label[for="' + nqEsc(el.id) + '"]');
      const t = nqTextWithoutOptions(forLabel);
      if (t) return t.slice(0, 160);
    } catch {}
  }

  const ancestorLabel = el.closest && el.closest('label');
  if (ancestorLabel) {
    const t = nqTextWithoutOptions(ancestorLabel);
    if (t) return t.slice(0, 160);
  }

  // ─── A group container names itself ───
  //
  // nqWrapperOf finds an ANCESTOR wrapper, so for a <fieldset> — which IS the
  // wrapper — it returns null and the fallback below never runs. Ashby's radio
  // groups are exactly that: a fieldset with no id, no aria-label, and its
  // question in a <label for=...> pointing at another element. nqLabelOf returned
  // "" for all three, the scan dropped them on its empty-label check, and the
  // accessibility tree then re-surfaced the member radios as two fields named
  // "Yes" and "No" — while the real questions went unasked.
  //
  // The text is right there: nqTextWithoutOptions strips the option labels and
  // leaves the question, which is how the member radios already resolve it.
  const tag = (el.tagName || '').toLowerCase();
  const role = el.getAttribute && el.getAttribute('role');
  if (tag === 'fieldset' || role === 'radiogroup' || role === 'group') {
    const own = nqTextWithoutOptions(el);
    if (own) return own.slice(0, 160);
  }

  const wrapper = nqWrapperOf(el);
  if (wrapper) {
    const t = nqTextWithoutOptions(wrapper.querySelector('label,legend,[class*="label"]'));
    if (t) return t.slice(0, 160);
  }

  let prev = el.previousElementSibling;
  for (let h = 0; prev && h < 3; h++, prev = prev.previousElementSibling) {
    const t = nqTextWithoutOptions(prev);
    if (t && t.length <= 160) return t.slice(0, 160);
  }

  return nqClean(el.name || el.id || el.placeholder || (el.getAttribute && el.getAttribute('data-qa')) || '').slice(0, 160);
}

/** Collapse a label to a stable identity that survives re-wording and re-rendering. */
function nqNormLabel(s) {
  return (s || '')
    .replace(/[*\\u2731\\uff0a\\u2217\\u066d]+/g, ' ')
    .replace(/\\(optional\\)|\\(required\\)/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim().toLowerCase().slice(0, 80);
}

/**
 * A stable key for a control.
 *
 * Ordered by durability. The label-derived key matters most: it is what a
 * control with no id, name or test attribute gets, and it survives the React
 * re-renders that made the old \`idx:\` fallback point at a different element a
 * few seconds later. Position is the last resort, for controls with no identity
 * of any kind.
 */
function nqKeyOf(el) {
  if (!el) return '';

  // ─── A group of checkboxes is ONE question ───
  //
  // Greenhouse renders "How did you learn about us? Select ALL that apply." as
  // 16 separate <input type="checkbox">, each with its own id but all sharing
  // one name. Keying on the id made every box a separate inventory item that
  // shared the same label — so the same answer was applied to all 16 and every
  // single option got ticked. The shared name is the question's identity.
  const t = (el.getAttribute && el.getAttribute('type') || '').toLowerCase();
  if ((t === 'checkbox' || t === 'radio') && el.name) {
    if (document.querySelectorAll('[name="' + nqEsc(el.name) + '"]').length > 1) {
      return 'group:' + el.name;
    }
  }

  // A fieldset wrapping a named group shares the group's identity. Without this
  // the container keys on its DOM index (idx:13) while its members key on
  // group:<name>, so the accessibility tree cannot tell they are the same
  // question and adds the members again as separate fields.
  const ktag = (el.tagName || '').toLowerCase();
  const krole = el.getAttribute && el.getAttribute('role');
  if (ktag === 'fieldset' || krole === 'radiogroup' || krole === 'group') {
    const member = el.querySelector('input[type="radio"][name],input[type="checkbox"][name]');
    if (member && member.name) return 'group:' + member.name;
  }

  if (el.id) return 'id:' + el.id;
  if (el.name) return 'name:' + el.name;
  const al = el.getAttribute && el.getAttribute('aria-label');
  if (al) return 'aria:' + nqClean(al).slice(0, 60);
  const dq = el.getAttribute && (el.getAttribute('data-qa') || el.getAttribute('data-testid'));
  if (dq) return 'data:' + dq;
  const auto = el.getAttribute && el.getAttribute('data-automation-id');
  if (auto) return 'auto:' + auto;
  const lbl = nqNormLabel(nqLabelOf(el));
  if (lbl) return 'lbl:' + lbl;
  const all = Array.from(document.querySelectorAll(NQ_CONTROL_SELECTOR));
  return 'idx:' + all.indexOf(el);
}

/** Everything we treat as a fillable control. */
const NQ_CONTROL_SELECTOR =
  'input,select,textarea,fieldset,[role="combobox"],[role="radiogroup"],[role="group"],[role="listbox"]';

/**
 * Does this container hold a control a PERSON can actually use?
 *
 * Ashby and Greenhouse both park a validation sentinel inside a button-group
 * container:
 *
 *   <input required tabindex="-1" aria-hidden="true" class="...requiredInput">
 *
 * It has no type attribute, so a bare input:not([type=hidden]) matches it and
 * a caller concludes the container is an ordinary field. It is not: the sentinel
 * is the thing that COMPLAINS when the real answer control is unanswered, not
 * the answer control itself.
 *
 * Both nqFindButtonGroups and nqResolveKey('btn:') must ask this question the
 * same way. They had two copies of the test, only one of which was corrected —
 * so discovery found the three required OpenAI questions and then the describe
 * step could not resolve them again, failing every one with element-not-found
 * while the inventory happily listed them. One definition, two callers.
 */
function nqHasRealControl(c) {
  return Array.from(c.querySelectorAll('input:not([type="hidden"]),select,textarea'))
    .some((el) => nqIsVisible(el) && el.getAttribute('aria-hidden') !== 'true' && el.tabIndex !== -1);
}

/** Find the control a key refers to. The inverse of nqKeyOf. */
function nqResolveKey(key) {
  if (!key) return null;
  try {
    if (key.startsWith('id:')) return document.getElementById(key.slice(3));
    if (key.startsWith('name:')) return document.querySelector('[name="' + nqEsc(key.slice(5)) + '"]');
    if (key.startsWith('data:')) {
      const v = key.slice(5);
      return document.querySelector('[data-qa="' + nqEsc(v) + '"],[data-testid="' + nqEsc(v) + '"]');
    }
    if (key.startsWith('auto:')) return document.querySelector('[data-automation-id="' + nqEsc(key.slice(5)) + '"]');
    if (key.startsWith('aria:')) {
      const v = key.slice(5);
      return Array.from(document.querySelectorAll('[aria-label]'))
        .find((e) => nqClean(e.getAttribute('aria-label')).slice(0, 60) === v) || null;
    }
    if (key.startsWith('lbl:')) {
      const want = key.slice(4);
      // Re-derive the label for each candidate and match on the normalised form,
      // so the lookup is exactly the inverse of how the key was built.
      const all = Array.from(document.querySelectorAll(NQ_CONTROL_SELECTOR));
      return all.find((e) => nqIsVisible(e) && !nqIsGhost(e) && nqNormLabel(nqLabelOf(e)) === want) || null;
    }
    if (key.startsWith('btn:')) {
      // Must apply the SAME filters nqFindButtonGroups used, or the key can
      // resolve to a different element than the one that produced it.
      // querySelectorAll returns ancestors before descendants, so an outer
      // wrapper whose first label happens to match was returned instead of the
      // real field container — and on a wizard that keeps completed steps in the
      // DOM under display:none, a repeated question resolved to the hidden copy,
      // whose buttons are all invisible. The handler then reported
      // "no-option-buttons" while the visible question went unanswered.
      const want = key.slice(4);
      const containers = Array.from(document.querySelectorAll('[class*="field"],[class*="question"],[class*="form-group"],fieldset'))
        .filter((c) => nqIsVisible(c) && !nqIsDecoy(c) && !nqInPopup(c))
        .filter((c) => !c.querySelector('[class*="fieldEntry"],[class*="field-entry"]'))
        .filter((c) => !nqHasRealControl(c));
      return containers.find((c) => {
        const lbl = c.querySelector('label,legend,[class*="label"]');
        return nqNormLabel(nqTextWithoutOptions(lbl)) === want;
      }) || null;
    }
    if (key.startsWith('group:')) {
      // The first VISIBLE, non-hidden member stands for the group; the handler
      // drives them all.
      //
      // Rails-backed forms — Greenhouse among them — emit
      // <input type="hidden" name="x" value="0"> immediately before the visible
      // checkboxes sharing that name. A bare querySelector returns that hidden
      // input, the describe step reports type="hidden", and selectHandler bails
      // with no-handler BEFORE it ever sees the group role: the entire question
      // fails on a decoy element the scan never considered a member.
      const name = key.slice(6);
      const members = Array.from(document.querySelectorAll('[name="' + nqEsc(name) + '"]'))
        .filter((e) => (e.getAttribute('type') || '').toLowerCase() !== 'hidden');
      return members.find(nqIsVisible) || members[0] || null;
    }
    if (key.startsWith('ax:')) {
      // Left on the page by the accessibility scan precisely so its findings
      // remain addressable afterwards.
      return document.querySelector('[data-nq-mmid="' + nqEsc(key.slice(3)) + '"]');
    }
    if (key.startsWith('idx:')) {
      const all = Array.from(document.querySelectorAll(NQ_CONTROL_SELECTOR));
      return all[parseInt(key.slice(4), 10)] || null;
    }
  } catch {}
  return null;
}

/**
 * Questions rendered as a row of buttons rather than as inputs.
 *
 * Ashby renders every Boolean question as two plain <button> elements carrying
 * aria-pressed and nothing else — no role="radio", no backing input. A scan
 * keyed on input/select/textarea sees no control at all, so "Are you authorized
 * to work…" and "Will you require sponsorship…" were not merely unanswered,
 * they were never on the checklist. Workday, Ashby and several smaller boards
 * all use this shape.
 */
/**
 * Checkbox and radio groups, collapsed into one question each.
 *
 * Returns the group's shared name, the question text, and the label of every
 * member — which is what lets a handler tick exactly the options that were
 * chosen instead of treating each box as an independent yes/no question.
 */
function nqFindInputGroups() {
  const byName = new Map();
  for (const el of document.querySelectorAll('input[type="checkbox"],input[type="radio"]')) {
    if (!el.name) continue;
    if (nqIsGhost(el)) continue;
    if (!nqIsVisible(el) || nqIsDecoy(el) || nqInPopup(el)) continue;
    if (!byName.has(el.name)) byName.set(el.name, []);
    byName.get(el.name).push(el);
  }

  const out = [];
  for (const [name, members] of byName) {
    if (members.length < 2) continue;   // a lone checkbox is its own question
    const first = members[0];

    // The question is whatever the members agree on, not any one option's text.
    const question =
      nqClean(first.getAttribute('description')) ||
      nqTextWithoutOptions(nqWrapperOf(first) && nqWrapperOf(first).querySelector('label,legend,[class*="label"]'));
    if (!question) continue;

    const optionLabelOf = (m) => {
      if (m.id) {
        try {
          const l = document.querySelector('label[for="' + nqEsc(m.id) + '"]');
          if (l) return nqClean(l.textContent);
        } catch {}
      }
      const anc = m.closest('label');
      if (anc) return nqClean(anc.textContent);
      return nqClean(m.getAttribute('aria-label') || m.value || '');
    };

    out.push({
      key: 'group:' + name,
      label: question.slice(0, 160),
      kind: first.type === 'radio' ? 'radio' : 'multiselect',
      options: members.map(optionLabelOf).filter(Boolean),
      answered: members.some((m) => m.checked),
      required: members.some((m) => m.required || m.getAttribute('aria-required') === 'true'),
    });
  }
  return out;
}

/**
 * Is this option button in the "chosen" state?
 *
 * ARIA first, and the class check is deliberately EXACT-TOKEN. The previous
 * test was /\\b(selected|active|checked)\\b/ against the full className, and a
 * word boundary matches across a hyphen — so "btn--active", "is-active",
 * Bootstrap's plain "active", and "tab-selected" all read as pressed. That made
 * an untouched Yes/No pair report as already answered: the scan marked the group
 * complete so it never reached the checklist, and the handler short-circuited
 * with filled:true without ever clicking. Ashby's knockout questions were
 * settled unanswered while the run reported success — the exact failure the
 * button-group support was written to fix.
 */
function nqButtonIsOn(b) {
  if (!b) return false;
  if (b.getAttribute('aria-pressed') === 'true') return true;
  if (b.getAttribute('aria-checked') === 'true') return true;
  if (b.getAttribute('aria-selected') === 'true') return true;
  if (b.checked === true) return true;
  const cls = typeof b.className === 'string' ? b.className : '';
  // Exact class tokens only — never a substring of a longer BEM/utility name.
  return cls.split(/\\s+/).some((t) => t === 'selected' || t === 'active' || t === 'checked' || t === 'is-selected' || t === 'is-active');
}

function nqFindButtonGroups() {
  const out = [];
  const containers = Array.from(document.querySelectorAll('[class*="field"],[class*="question"],[class*="form-group"],fieldset'));
  for (const c of containers) {
    if (!nqIsVisible(c) || nqIsDecoy(c) || nqInPopup(c)) continue;
    // Innermost container only — a section also matches [class*="field"].
    if (c.querySelector('[class*="fieldEntry"],[class*="field-entry"]')) continue;
    // Skip containers that already hold a usable control — see nqHasRealControl
    // for why "usable" has to exclude Ashby's and Greenhouse's validation
    // sentinels, and why this test lives in one place.
    if (nqHasRealControl(c)) continue;

    const buttons = Array.from(c.querySelectorAll('button,[role="button"],[role="radio"],[role="checkbox"]'))
      .filter(nqIsVisible)
      .filter((b) => {
        const t = nqClean(b.innerText || b.getAttribute('aria-label'));
        // Option buttons are short. This excludes "Upload File", "Add another",
        // and anything that is plainly an action rather than an answer.
        return t && t.length <= 40 && !/^(upload|add|remove|replace|browse|choose file|cancel|back|next|submit)\\b/i.test(t);
      });
    if (buttons.length < 2) continue;

    const lblNode = c.querySelector('label,legend,[class*="label"]');
    const label = nqTextWithoutOptions(lblNode);
    if (!label) continue;

    out.push({
      key: 'btn:' + nqNormLabel(label),
      label: label.slice(0, 160),
      options: buttons.map((b) => nqClean(b.innerText || b.getAttribute('aria-label'))),
      // A group is answered when one of its buttons reads as selected.
      answered: buttons.some(nqButtonIsOn),
      required: c.getAttribute('aria-required') === 'true'
        || /[*\\u2731\\uff0a\\u2217\\u066d]/.test(nqClean(lblNode && lblNode.textContent))
        || !!c.querySelector('[class*="required"]'),
    });
  }
  return out;
}
`
