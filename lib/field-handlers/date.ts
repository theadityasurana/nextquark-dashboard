import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"

/**
 * Date inputs and calendar widgets — the Ashby "When can you start a new role?"
 * field that opened a calendar and could not be navigated.
 *
 * Typing is tried before fighting the popup, because almost every calendar
 * widget also accepts a typed date and typing is far more reliable than clicking
 * through month navigation. `ctx.value` carries pipe-separated format candidates
 * (US | ISO | EU) since forms rarely say which they want.
 */
export const dateHandler: FieldHandler = {
  name: "date",
  priority: 40,

  canHandle(d: ElementDescriptor): boolean {
    // ─── A picker inside a date block is still a picker ───
    //
    // This handler sits at priority 40, ahead of typeahead's 50, so anything it
    // claims never reaches the combobox code. Greenhouse renders an education row
    // as "Start date month" and "Start date year" — two react-selects that live in
    // a date container — and this claimed both, then failed them 6 times in one
    // run with `date-unhandled` while the correct values ("September", "2020")
    // sat right there waiting to be selected.
    //
    // A native <input type="date"> is a date. A combobox is a combobox, whatever
    // container it happens to sit in, so it is handed on to typeahead/dropdown.
    const isPicker =
      d.tag === "select" ||
      d.role === "combobox" ||
      d.role === "listbox" ||
      !!d.ariaControls ||
      !!d.ariaAutocomplete ||
      d.ariaHasPopup === "listbox" ||
      /select__|react-select/i.test(d.className ?? "")
    if (isPicker && d.type !== "date" && d.type !== "month") return false

    if (d.type === "date" || d.type === "month") return true
    if (d.ariaHasPopup === "dialog" && d.inDateContainer) return true
    if (d.inDateContainer) return true
    return /date|calendar|datepicker/i.test(`${d.className ?? ""} ${d.placeholder ?? ""}`)
  },

  vmCode(ctx: HandlerContext): string {
    return `
const el = document.querySelector('[${ctx.targetAttr}="1"]');
if (!el) return { handled: true, filled: false, reason: 'element-vanished' };

if ((el.value || '').trim()) {
  // Already answered. Re-opening the picker to "confirm" is what produced two
  // date selections on one field.
  return { handled: true, filled: true, reason: 'already-filled', picked: el.value };
}

const candidates = ${JSON.stringify(ctx.value)}.split('|').filter(Boolean);
const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

el.scrollIntoView({ block: 'center' });
el.focus();
await sleep(rnd(250, 550));

/**
 * Dismiss an open calendar popup.
 *
 * react-datepicker and friends leave the calendar open after a value is set.
 * An open calendar is an overlay: it sits on top of the FOLLOWING field and
 * swallows the click meant for it. That is how a run "comes back to the
 * calendar" — it never actually left, and the next field's click landed on a day
 * cell instead. Closing it is part of filling the field, not a nicety.
 */
const closeCalendar = async () => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  el.blur();
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  // A click on the page background dismisses widgets that ignore Escape.
  try { document.body.click(); } catch {}
  await waitForMutation(700, 150);
  const stillOpen = document.querySelector(
    '.react-datepicker,[class*="datepicker__month"],[class*="calendar-popup"],[role="dialog"][class*="date"]'
  );
  return !stillOpen;
};

for (const candidate of candidates) {
  try {
    if (nativeSetter) nativeSetter.call(el, candidate); else el.value = candidate;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(350);
    const got = (el.value || '').replace(/\\s/g, '');
    if (got.length >= 6) {
      const closed = await closeCalendar();
      // Re-read AFTER closing: some widgets revert an unconfirmed typed value
      // on blur, and reporting success there would settle an empty field.
      const final = (el.value || '').trim();
      if (!final) continue;
      return { handled: true, filled: true, reason: closed ? 'typed-date' : 'typed-date-calendar-still-open', picked: final };
    }
  } catch {}
}

// Fall back to clicking a day cell in an open calendar.
const dayMatch = candidates[0] && candidates[0].match(/\\b(\\d{1,2})\\b/g);
const day = dayMatch && dayMatch.length > 1 ? parseInt(dayMatch[1], 10) : null;
if (day) {
  const cells = Array.from(document.querySelectorAll('[role="gridcell"],td,button'))
    .filter(c => {
      const r = c.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      if (c.hasAttribute('disabled') || c.getAttribute('aria-disabled') === 'true') return false;
      return (c.textContent || '').trim() === String(day);
    });
  if (cells.length) {
    cells[0].click();
    await sleep(300);
    await closeCalendar();
    const got = (el.value || '').trim();
    if (got) return { handled: true, filled: true, reason: 'clicked-day-cell', picked: got };
  }
}

// Never leave a calendar open behind us, even on the failure path — the next
// field's click would land on it.
await closeCalendar();

return { handled: true, filled: false, reason: 'date-unhandled' };
`
  },
}
