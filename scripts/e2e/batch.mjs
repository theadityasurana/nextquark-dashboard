#!/usr/bin/env node
/**
 * Campaign runner: drive the real apply pipeline against a list of postings,
 * N at a time, until every one of them has been submitted.
 *
 * Each target gets its own vitest process (the e2e config is single-fork, so
 * concurrency has to come from separate processes, not from the test runner).
 * State is persisted after every completion, so the campaign survives a crash,
 * a Ctrl-C, or a round of code fixes in between passes: re-running only picks
 * up the targets that are not yet `submitted`.
 *
 *   node scripts/e2e/batch.mjs                 # run every unfinished target
 *   node scripts/e2e/batch.mjs gh-natera ...   # run just these ids
 *   CONCURRENCY=4 node scripts/e2e/batch.mjs
 */
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const TARGETS = JSON.parse(fs.readFileSync("scripts/e2e/targets.json", "utf8"))
const STATE_PATH = "scripts/e2e/state.json"
const LOG_DIR = "scripts/e2e/logs"
const PROFILE = process.env.E2E_PROFILE || "d34ffc21-c230-4795-843d-a6f015b5c01c"
const CONCURRENCY = Number(process.env.CONCURRENCY || 4)
const DRY = process.env.E2E_DRY_RUN === "1"

fs.mkdirSync(LOG_DIR, { recursive: true })
const state = fs.existsSync(STATE_PATH) ? JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) : {}
const save = () => fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 1))

const only = process.argv.slice(2)
const queue = TARGETS.filter((t) => {
  if (only.length) return only.includes(t.id)
  return state[t.id]?.status !== "submitted"
})

if (!queue.length) {
  console.log("Nothing to do — every target is already submitted.")
  process.exit(0)
}

/**
 * The e2e harness prints the kernel's return value under a RESULT banner. Pull
 * that JSON back out rather than re-deriving success from log prose, which has
 * bitten us before: "Application submitted" appears in narration long before
 * the submit gate has actually cleared.
 */
function classify(log) {
  const i = log.lastIndexOf("  RESULT")
  const tail = i === -1 ? log : log.slice(i)
  const m = tail.match(/\{[\s\S]*?\n\}/)
  let result = null
  if (m) { try { result = JSON.parse(m[0]) } catch {} }
  if (result?.success === true) return { status: "submitted", result }
  const reason =
    result?.error ||
    result?.failure?.reason ||
    (log.match(/STEP ERROR (.+)/g) || []).slice(-1)[0] ||
    (log.match(/Error: .+/g) || []).slice(-1)[0] ||
    "unknown — see log"
  return { status: "failed", result, reason: String(reason).slice(0, 400) }
}

function run(t) {
  return new Promise((resolve) => {
    const logPath = path.join(LOG_DIR, `${t.id}.log`)
    const out = fs.createWriteStream(logPath)
    const started = Date.now()
    const child = spawn(
      "npx",
      ["vitest", "run", "--config", "scripts/e2e/vitest.e2e.config.ts", "scripts/e2e/apply.e2e.ts"],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          E2E_URL: t.url,
          E2E_PROFILE: PROFILE,
          ...(DRY ? { E2E_DRY_RUN: "1" } : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    )
    child.stdout.pipe(out)
    child.stderr.pipe(out)
    child.on("close", (code) => {
      out.end()
      const log = fs.readFileSync(logPath, "utf8")
      const c = classify(log)
      const prev = state[t.id] || {}
      state[t.id] = {
        ...t,
        status: c.status,
        attempts: (prev.attempts || 0) + 1,
        seconds: Math.round((Date.now() - started) / 1000),
        exitCode: code,
        reason: c.reason,
        result: c.result,
        log: logPath,
        at: new Date().toISOString(),
      }
      save()
      const tag = c.status === "submitted" ? "✅ SUBMITTED" : "❌ FAILED   "
      console.log(`${tag} ${t.id.padEnd(16)} ${String(state[t.id].seconds).padStart(4)}s  ${t.company}` +
        (c.status === "submitted" ? "" : `\n              ↳ ${state[t.id].reason.split("\n")[0]}`))
      resolve()
    })
  })
}

const done = () => TARGETS.filter((t) => state[t.id]?.status === "submitted").length
console.log(`Campaign: ${queue.length} target(s) this pass, ${CONCURRENCY} at a time. ` +
  `${done()}/${TARGETS.length} already submitted.${DRY ? "  [DRY RUN]" : ""}`)

let i = 0
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (i < queue.length) await run(queue[i++])
  })
)

console.log(`\nPass complete — ${done()}/${TARGETS.length} submitted.`)
for (const t of TARGETS) {
  const s = state[t.id]
  if (s?.status !== "submitted") console.log(`  pending: ${t.id.padEnd(16)} ${s?.reason?.split("\n")[0] || "(not yet run)"}`)
}
