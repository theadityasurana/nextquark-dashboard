/**
 * Handler registry and dispatcher.
 *
 * Handlers are tried in priority order and the FIRST whose `canHandle` returns
 * true wins. Priority is what keeps the catch-all `text` handler from swallowing
 * every control: specific handlers (checkboxgroup 5, checkbox 10, buttongroup 15, radio 20,
 * dropdown 30, date 40, typeahead 50) all outrank it at 90.
 *
 * Selection is pure, so it can be tested exhaustively without a browser.
 */

import type { ElementDescriptor, FieldHandler, HandlerContext } from "./base"
import { VM_PRELUDE } from "./base"
import { VM_DOM_HELPERS } from "../vm-dom"
import { checkboxHandler } from "./checkbox"
import { buttonGroupHandler } from "./buttongroup"
import { checkboxGroupHandler } from "./checkboxgroup"
import { radioHandler } from "./radio"
import { dropdownHandler } from "./dropdown"
import { dateHandler } from "./date"
import { typeaheadHandler } from "./typeahead"
import { textHandler } from "./text"

export * from "./base"
export { checkboxHandler, checkboxGroupHandler, buttonGroupHandler, radioHandler, dropdownHandler, dateHandler, typeaheadHandler, textHandler }

/** All handlers, priority-sorted at module load so dispatch is a plain scan. */
export const HANDLERS: FieldHandler[] = [
  checkboxGroupHandler,
  checkboxHandler,
  buttonGroupHandler,
  radioHandler,
  dropdownHandler,
  dateHandler,
  typeaheadHandler,
  textHandler,
].sort((a, b) => a.priority - b.priority)

/**
 * The handler for a control, or null when nothing can drive it.
 *
 * Hidden inputs return null deliberately: writing to one is never correct, and
 * they were previously reaching the text handler.
 */
export function selectHandler(d: ElementDescriptor): FieldHandler | null {
  if (d.type === "hidden") return null
  if (d.type === "file") return null // résumé upload has its own dedicated path
  return HANDLERS.find((h) => h.canHandle(d)) ?? null
}

/**
 * Build the complete VM program for one field: the shared prelude plus the
 * chosen handler's code, wrapped in an async IIFE so `await` and early `return`
 * both work inside `playwright.execute`.
 */
export function buildHandlerProgram(handler: FieldHandler, ctx: HandlerContext): string {
  return `
${VM_DOM_HELPERS}
${VM_PRELUDE}
const result = await (async () => {
${handler.vmCode(ctx)}
})();
return { ...result, handler: ${JSON.stringify(handler.name)} };
`
}
