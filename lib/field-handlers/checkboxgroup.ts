import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * A group of checkboxes or radios that together form ONE question.
 *
 * Greenhouse renders "How did you learn about us? Select ALL that apply." as
 * sixteen `<input type="checkbox">`, each with its own id but all sharing one
 * `name`. Scanned per-element they looked like sixteen separate yes/no
 * questions that happened to share a label, so the single answer resolved for
 * that label — "LinkedIn" — was applied to every one of them and the form went
 * out with all sixteen sources ticked.
 *
 * This handler receives the group and ticks only the options that were actually
 * chosen. Two rules matter:
 *
 *   · Boxes we did not choose are LEFT ALONE, never unticked. A pre-ticked box
 *     may be the portal's own default, and silently clearing it changes an
 *     answer nobody asked us to change.
 *   · An already-answered group is left completely untouched. Clicking a
 *     checked box toggles it OFF, which is how an automated "retry" turns a
 *     correct answer into a blank one.
 */
export const checkboxGroupHandler: FieldHandler = {
  name: "checkboxgroup",
  // Above the plain checkbox handler (10) so a grouped member is never driven
  // as if it were a standalone consent box.
  priority: 5,

  canHandle(d: ElementDescriptor): boolean {
    return d.role === "nq-checkboxgroup"
  },

  vmCode(ctx: HandlerContext): string {
    return `
const seed = document.querySelector('[${ctx.targetAttr}="1"]');
if (!seed || !seed.name) return { handled: true, filled: false, reason: 'element-vanished' };

const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
const isVis = (el) => {
  const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
  return (r.width > 0 || r.height > 0) && s.display !== 'none' && s.visibility !== 'hidden';
};

const members = Array.from(document.querySelectorAll('[name="' + esc(seed.name) + '"]')).filter(isVis);
if (!members.length) return { handled: true, filled: false, reason: 'no-group-members' };

const labelOf = (m) => {
  if (m.id) { const l = document.querySelector('label[for="' + esc(m.id) + '"]'); if (l) return clean(l.textContent); }
  const anc = m.closest('label'); if (anc) return clean(anc.textContent);
  return clean(m.getAttribute('aria-label') || m.value || '');
};
const options = members.map(labelOf);

// Already answered — leave it exactly as it is. Re-clicking would toggle a
// correct answer off.
const preChecked = members.filter((m) => m.checked).map(labelOf);
if (preChecked.length) {
  return { handled: true, filled: true, reason: 'already-selected', picked: preChecked.join(', '), options };
}

// The value may name several options: "LinkedIn, Referral" or "LinkedIn|Event".
const wanted = ${JSON.stringify(ctx.value)}.split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
if (!wanted.length) {
  return { handled: true, filled: false, reason: 'no-value-to-select', options, needsModelChoice: true };
}

const chosen = [];
for (const want of wanted) {
  const idx = bestIndex(want, options);
  if (idx < 0) continue;
  const m = members[idx];
  if (m.checked) { chosen.push(options[idx]); continue; }
  m.scrollIntoView({ block: 'center' });
  await sleep(rnd(150, 380));
  clickVia(m);
  await sleep(200);
  if (!m.checked) { try { m.click(); await sleep(180); } catch {} }
  if (m.checked) chosen.push(options[idx]);
}

if (!chosen.length) {
  // Nothing we wanted exists in this group — hand the real options to the model
  // rather than ticking something arbitrary.
  return { handled: true, filled: false, reason: 'no-matching-option', options, needsModelChoice: true };
}

await waitForMutation(800, 150);
return { handled: true, filled: true, reason: 'checked-options', picked: chosen.join(', '), options };
`
  },
}
