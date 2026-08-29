/**
 * The form inventory — scan once, then work a fixed checklist to completion.
 *
 * WHY THIS REPLACES THE AUDIT LOOP
 * --------------------------------
 * The previous design rediscovered fields every round: audit the DOM → fill what
 * looks unfilled → re-audit. Two structural flaws, both of which produced bugs
 * we chased for a long time:
 *
 *  1. **It only ever saw REQUIRED fields.** The audit selected on `[required]`,
 *     `aria-required`, and a `*` in the label. Every optional question was
 *     invisible, so the driver genuinely never attempted them and then submitted
 *     anyway. "It isn't answering every question" was the design, not a bug in it.
 *
 *  2. **Rediscovery cannot distinguish "done" from "reappeared."** Because the
 *     field set was rebuilt each round from mutable DOM state, a control whose
 *     filled-ness we misread came back forever, and every guard we added was
 *     defending against that rather than fixing it.
 *
 * A single scan fixes both. The item set is decided ONCE, keyed on stable
 * element identifiers, and each item carries its own terminal status. Progress
 * is countable (`7/12 answered`), completion is a predicate rather than a guess,
 * and nothing can reappear because nothing is rediscovered.
 *
 * Verification still re-reads the DOM — but against the FIXED key set, which is
 * a lookup, not a discovery, and therefore cannot loop.
 *
 * Pure and DOM-free; the VM scan that produces items lives in kernel.ts.
 */

/** How an item is driven. Mirrors the field-handler names. */
export type ItemKind =
  | "text"
  | "textarea"
  | "checkbox"
  | "radio"
  | "select"
  | "multiselect"
  | "typeahead"
  | "date"
  | "file"
  | "unknown"

export type ItemStatus =
  /** Not yet attempted. */
  | "pending"
  /** Confirmed filled — verified against the DOM, not merely attempted. */
  | "filled"
  /** Deliberately left alone: optional and we have no honest answer. */
  | "skipped"
  /** Attempted and failed. Blocks submit when the item is required. */
  | "failed"
  /** Needs a human: sensitive question, or unidentifiable control. */
  | "needs_human"

export interface FormItem {
  /** Stable element key (`id:…`, `name:…`, `idx:…`). Decided once at scan time. */
  key: string
  label: string
  kind: ItemKind
  required: boolean
  /** Rendered options for select/radio/multiselect. Empty otherwise. */
  options: string[]
  /** Radio-group identifier, so sibling radios collapse into one item. */
  group?: string | null
}

export interface FormInventory {
  items: FormItem[]
  url: string
  scannedAt: string
}

/** Per-item outcome, kept apart from the inventory so items stay immutable. */
export interface ItemState {
  status: ItemStatus
  /** What we entered / selected. */
  value?: string
  /** Why it's in this state — the operator-facing explanation. */
  reason?: string
  attempts: number
}

export type InventoryState = Map<string, ItemState>

export function initState(inv: FormInventory): InventoryState {
  const m: InventoryState = new Map()
  for (const item of inv.items) m.set(item.key, { status: "pending", attempts: 0 })
  return m
}

/** Read a state, tolerating an unknown key. */
export function stateOf(state: InventoryState, key: string): ItemState {
  return state.get(key) ?? { status: "pending", attempts: 0 }
}

export function setStatus(
  state: InventoryState,
  key: string,
  status: ItemStatus,
  extra: { value?: string; reason?: string } = {}
): void {
  const prev = stateOf(state, key)
  state.set(key, { ...prev, ...extra, status })
}

export function recordAttempt(state: InventoryState, key: string): number {
  const prev = stateOf(state, key)
  const attempts = prev.attempts + 1
  state.set(key, { ...prev, attempts })
  return attempts
}

export interface InventorySummary {
  total: number
  required: number
  answered: number
  requiredAnswered: number
  pending: number
  failed: number
  skipped: number
  needsHuman: number
  /** Required items not in a terminal-good state — what blocks submit. */
  blockers: FormItem[]
  /** Optional items still unanswered. Worth reporting, never blocking. */
  optionalRemaining: FormItem[]
  percent: number
}

/**
 * Roll the checklist up.
 *
 * `answered` counts `filled` only. A `skipped` optional item is fine but is not
 * an answer, and conflating the two is how a half-filled form looked complete.
 */
export function summarize(inv: FormInventory, state: InventoryState): InventorySummary {
  let answered = 0
  let requiredAnswered = 0
  let pending = 0
  let failed = 0
  let skipped = 0
  let needsHuman = 0
  const blockers: FormItem[] = []
  const optionalRemaining: FormItem[] = []
  const required = inv.items.filter((i) => i.required).length

  for (const item of inv.items) {
    const st = stateOf(state, item.key)
    switch (st.status) {
      case "filled":
        answered++
        if (item.required) requiredAnswered++
        break
      case "pending":
        pending++
        break
      case "failed":
        failed++
        break
      case "skipped":
        skipped++
        break
      case "needs_human":
        needsHuman++
        break
    }
    if (st.status !== "filled") {
      if (item.required) blockers.push(item)
      else if (st.status === "pending" || st.status === "failed") optionalRemaining.push(item)
    }
  }

  return {
    total: inv.items.length,
    required,
    answered,
    requiredAnswered,
    pending,
    failed,
    skipped,
    needsHuman,
    blockers,
    optionalRemaining,
    percent: inv.items.length ? Math.round((answered / inv.items.length) * 100) : 100,
  }
}

export interface SubmitDecision {
  canSubmit: boolean
  /** Operator-facing explanation when submit is refused. */
  reason: string | null
  blockers: FormItem[]
}

/**
 * Whether the form is complete enough to submit.
 *
 * Gates on REQUIRED items only. An unanswered optional question is reported but
 * never blocks — refusing to submit over one would fail applications that a
 * human would happily send.
 *
 * A `needs_human` required item blocks with a distinct reason: that is not a
 * failure to try, it is a deliberate refusal to answer on someone's behalf, and
 * an operator should see the difference.
 */
export function decideSubmit(inv: FormInventory, state: InventoryState): SubmitDecision {
  const s = summarize(inv, state)
  if (!s.blockers.length) {
    return { canSubmit: true, reason: null, blockers: [] }
  }

  const humanBlockers = s.blockers.filter((b) => stateOf(state, b.key).status === "needs_human")
  const parts: string[] = []
  if (humanBlockers.length) {
    parts.push(
      `${humanBlockers.length} required question(s) need a human: ${humanBlockers.map((b) => b.label).slice(0, 4).join(" | ")}`
    )
  }
  const others = s.blockers.filter((b) => !humanBlockers.includes(b))
  if (others.length) {
    parts.push(
      `${others.length} required field(s) unanswered: ${others.map((b) => `${b.label} [${b.kind}]`).slice(0, 6).join(" | ")}`
    )
  }

  return { canSubmit: false, reason: parts.join(" — "), blockers: s.blockers }
}

/**
 * The next item to work on, or null when the checklist is exhausted.
 *
 * Ordering is deliberate: required before optional (so a run that runs out of
 * time has done the things that matter), and cheap deterministic widgets before
 * anything needing a model.
 */
export function nextItem(
  inv: FormInventory,
  state: InventoryState,
  maxAttempts = 2
): FormItem | null {
  const workable = inv.items.filter((i) => {
    const st = stateOf(state, i.key)
    if (st.status === "filled" || st.status === "skipped" || st.status === "needs_human") return false
    return st.attempts < maxAttempts
  })
  if (!workable.length) return null

  const cost: Record<ItemKind, number> = {
    checkbox: 0,
    radio: 1,
    select: 2,
    multiselect: 3,
    date: 4,
    text: 5,
    typeahead: 6,
    textarea: 7,
    file: 8,
    unknown: 9,
  }

  return workable.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1
    return (cost[a.kind] ?? 9) - (cost[b.kind] ?? 9)
  })[0]
}

/**
 * Merge a re-scan into an existing inventory.
 *
 * Forms grow: answering "Do you require sponsorship? → Yes" can reveal a
 * follow-up. New keys are appended as pending; existing items keep their status,
 * so a re-scan can NEVER resurrect something already answered — which is the
 * property the old rediscovery loop lacked.
 */
export function mergeScan(
  inv: FormInventory,
  state: InventoryState,
  rescanned: FormItem[]
): { inventory: FormInventory; added: FormItem[] } {
  const known = new Set(inv.items.map((i) => i.key))
  const added = rescanned.filter((i) => !known.has(i.key))
  for (const item of added) state.set(item.key, { status: "pending", attempts: 0 })

  // Refresh options on existing items — a dependent dropdown may have populated
  // since the first scan — without touching status.
  const byKey = new Map(rescanned.map((i) => [i.key, i]))
  const items = inv.items.map((i) => {
    const fresh = byKey.get(i.key)
    return fresh && fresh.options.length && !i.options.length ? { ...i, options: fresh.options } : i
  })

  return { inventory: { ...inv, items: [...items, ...added] }, added }
}
