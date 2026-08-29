/**
 * The Stagehand v4 seam.
 *
 * `kernel.ts` drives almost everything through Kernel's own
 * `browsers.playwright.execute` — real Playwright, in the VM, running code we
 * wrote. Stagehand is used for the three things that genuinely need a model:
 * `observe` (plan an action), `act` (perform it), and now `extract` (pull
 * structured data off the page). Keeping that surface in one file means the
 * SDK version is a single reviewable seam rather than a hundred call sites.
 *
 * ── WHY v4 ──
 *
 * v3 has no `extract`, no way to scope an operation to a subtree, and no way to
 * target a page other than the active one. All three are things the fill loop
 * wants. v4 adds them.
 *
 * ── WHAT v4 TOOK AWAY ──
 *
 * Three removals matter here, and each is handled rather than worked around:
 *
 *  1. **`stagehand.agent()` is gone.** We never used it — it threw
 *     `awaitActivePage` over Kernel's CDP connection, which is why this file's
 *     ancestor moved to observe→act in the first place. No loss.
 *
 *  2. **`page.evaluate()` is gone.** Every DOM read now goes through the VM,
 *     which is where the rest of this codebase already does it. That is a
 *     simplification, not a workaround.
 *
 *  3. **A model `baseURL` is gone.** v4 takes `{ modelName, apiKey }` or a full
 *     client-LLM callback; there is no way to point it at OpenRouter. So
 *     Stagehand's own act/observe/extract run on direct Gemini or OpenAI, while
 *     OpenRouter stays primary for every call `kernel.ts` makes itself over
 *     plain HTTP (answers, judge, distiller) — which is the larger share of the
 *     spend. See {@link pickStagehandModel}.
 */

import type { z } from "zod/v4"

/** A model this seam can hand to Stagehand v4. */
export interface V4ModelChoice {
  /** Provider-prefixed name, e.g. "google/gemini-2.5-flash". */
  modelName: string
  apiKey: string
  /** For logs. */
  label: string
}

/**
 * Choose the Stagehand model from the keys available.
 *
 * OpenRouter is deliberately excluded: v4 has no `baseURL`, so an OpenRouter
 * key here would be sent to Google's or OpenAI's endpoint and rejected. Callers
 * keep using OpenRouter for their own direct HTTP calls.
 *
 * Returns null when only an OpenRouter key is configured — the caller must then
 * skip the Stagehand-backed paths rather than fail the whole run, because the
 * deterministic VM handlers still do most of the work without a model.
 */
export function pickStagehandModel(keys: {
  geminiKey?: string
  openAiKey?: string
}): V4ModelChoice | null {
  return buildV4ModelChain(keys)[0] ?? null
}

/**
 * The ordered list of models Stagehand may use, best first.
 *
 * More than one matters because a quota-exhausted key is the single most common
 * way this pipeline silently stops working: every observe returns nothing, so
 * every field reports "no actions found" and the form fills with zeros. A
 * second provider turns that from an outage into a slower run.
 */
export function buildV4ModelChain(keys: { geminiKey?: string; openAiKey?: string }): V4ModelChoice[] {
  const chain: V4ModelChoice[] = []
  if (keys.geminiKey) {
    chain.push({ modelName: "google/gemini-2.5-flash", apiKey: keys.geminiKey, label: "gemini-2.5-flash" })
  }
  if (keys.openAiKey) {
    chain.push({ modelName: "openai/gpt-4.1-mini", apiKey: keys.openAiKey, label: "gpt-4.1-mini" })
    chain.push({ modelName: "openai/gpt-4o-mini", apiKey: keys.openAiKey, label: "gpt-4o-mini" })
  }
  return chain
}

/** What the driver exposes to kernel.ts. Intentionally small. */
export interface StagehandDriver {
  /** Plan an action without performing it. Side-effect free, so retrying is safe. */
  observe(
    instruction: string,
    options?: { iframes?: boolean; model?: V4ModelChoice; selector?: string }
  ): Promise<Array<Record<string, any>>>
  /**
   * Perform a planned action.
   *
   * Takes the `Action` object from {@link observe}, never a raw string: an
   * observed action replays deterministically with no second inference pass.
   */
  act(action: Record<string, any>, options?: { model?: V4ModelChoice }): Promise<{ ok: boolean; message: string }>
  /**
   * Pull structured data off the page against a schema.
   *
   * `selector` scopes the extraction to one subtree — the difference between
   * "read the confirmation number from this banner" and "read it from a page
   * that also contains a footer full of numbers".
   */
  extract<S extends z.ZodType>(
    instruction: string,
    schema: S,
    options?: { selector?: string; model?: V4ModelChoice }
  ): Promise<z.output<S> | null>
  /** Close the Stagehand client. Leaves the underlying Kernel session running. */
  close(): Promise<void>
  /** Which model this driver is using, for logs. */
  readonly modelLabel: string
}

export interface CreateDriverOptions {
  /** Kernel's CDP websocket URL for the live browser session. */
  cdpUrl: string
  model: V4ModelChoice
  /** Forms render slowly over CDP; Kernel's docs recommend a long settle. */
  domSettleTimeoutMs?: number
  /** Receives Stagehand's internal reasoning, when the caller wants it. */
  onLog?: (level: "info" | "warn", message: string) => void
}

/**
 * Connect Stagehand v4 to an existing Kernel browser session.
 *
 * `localBrowser.connect()` attaches over CDP and, importantly, leaves the
 * session running when the Stagehand client closes — `kernel.ts` deletes the
 * Kernel session itself, after it has stopped the replay and flushed the
 * profile. Closing the browser here would cut that short.
 */
export async function createDriver(opts: CreateDriverOptions): Promise<StagehandDriver> {
  const { localBrowser, Stagehand } = (await import("@browserbasehq/stagehand-v4")) as any

  const browser = await localBrowser.connect({ cdpUrl: opts.cdpUrl })

  const stagehand = await Stagehand.create({
    browser,
    model: { modelName: opts.model.modelName, apiKey: opts.model.apiKey },
    domSettleTimeoutMs: opts.domSettleTimeoutMs ?? 30_000,
    ...(opts.onLog
      ? {
          logging: {
            level: "info",
            onLog: (log: any) => {
              try {
                const category = log?.data?.category ? `[${log.data.category}] ` : ""
                opts.onLog!(log?.level === "warn" || log?.level === "error" ? "warn" : "info", `${category}${log?.message ?? ""}`)
              } catch {
                // A logging hook must never take down the run.
              }
            },
          },
        }
      : {}),
  })

  return {
    modelLabel: opts.model.label,

    async observe(instruction, options) {
      const callOpts: Record<string, any> = {}
      if (options?.iframes) callOpts.iframes = true
      if (options?.model) callOpts.model = { modelName: options.model.modelName, apiKey: options.model.apiKey }
      if (options?.selector) callOpts.locator = (await currentPage(browser)).locator(options.selector)
      const res = await stagehand.observe(instruction, Object.keys(callOpts).length ? callOpts : undefined)
      // v4 returns { data: Action[] }; be tolerant of a bare array too.
      const data = (res?.data ?? res) as unknown
      return Array.isArray(data) ? (data as Array<Record<string, any>>) : []
    },

    async act(action, options) {
      try {
        const callOpts = options?.model
          ? { model: { modelName: options.model.modelName, apiKey: options.model.apiKey } }
          : undefined
        const res = await stagehand.act(action as any, callOpts as any)
        // v4's ActResult reports failure by returning, not by throwing — the
        // exact trap that made an earlier version of this code treat every
        // returned result as a success and never fall back.
        const ok = res?.success !== false
        const message = res?.message ?? res?.data?.message ?? (ok ? "ok" : "act reported failure")
        return { ok, message: String(message) }
      } catch (err) {
        return { ok: false, message: err instanceof Error ? err.message : String(err) }
      }
    },

    async extract(instruction, schema, options) {
      try {
        const callOpts: Record<string, any> = {}
        if (options?.selector) callOpts.locator = (await currentPage(browser)).locator(options.selector)
        if (options?.model) callOpts.model = { modelName: options.model.modelName, apiKey: options.model.apiKey }
        const res = await stagehand.extract(
          instruction,
          schema,
          Object.keys(callOpts).length ? callOpts : undefined
        )
        return (res?.data ?? null) as any
      } catch (err) {
        // Extraction is always a fallback tier in this codebase — a failure
        // means the deterministic path's answer stands, not that the run fails.
        return null
      }
    },

    async close() {
      try {
        await stagehand.close()
      } catch {
        // Best effort: the Kernel session is torn down separately.
      }
    },
  }
}

/** The page Stagehand is currently pointed at. */
async function currentPage(browser: any): Promise<any> {
  const active = await browser.context.activePage()
  if (active) return active
  const pages = await browser.context.pages()
  return pages[0]
}
