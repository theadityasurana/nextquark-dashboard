# Application Pipeline

How a queued application becomes a submitted one, and how to run, monitor and fix the
system. For the wider product, see [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md).

## How it fits together

```text
live_application_queue (pending)
        │  claim_applications RPC, polled every 3 seconds
        ▼
scripts/application-worker.ts      one long-running process, not serverless
        │
        ▼
lib/application-runner.ts          checks, then the final status of the row
        │
        ▼
lib/kernel.ts                      drives a Kernel cloud browser through the form
        │
        ├─ playwright.execute      field filling and page reading, in Kernel's VM
        ├─ Stagehand               fallback only, connected when a field needs it
        ├─ LLM chain               Groq → Gemini → OpenRouter free, then paid
        └─ inbound_emails          verification codes and confirmation emails
```

The worker is the **only** automatic dispatcher. The old browser-tab timers, cron route
and insert trigger were removed because they could each start the same row. It has to be
a long-running process because a browser run can outlive a serverless function.

## Dashboard controls

The worker reads these from `settings.ui_preferences` on every poll, so changes apply to
new claims within about 3 seconds. Runs already in progress finish.

| Control | Effect |
|---|---|
| Auto Start | Whether the worker claims new applications |
| Concurrency | Maximum applications running at once |
| Premium Only | Claim premium rows only |

## Claiming

`claim_applications` (migrations 085, 086, 089) is atomic. A row with a live lease **is** a
running application, so there is no counter to drift, and a crashed worker's slot frees
itself when its lease expires.

- **One running application per candidate.** One slow inbox can't fill the cap, and two
  runs can't share an inbox and take each other's verification code.
- **No repeat submissions.** A job already completed for that candidate isn't claimed.
- **Leases** last 5 minutes and renew every minute. A run stops renewing after 30 minutes.
- **`reclaim_expired_leases`** runs every minute and returns abandoned rows to the queue.

## What happens to one application

1. **Résumé.** Reads `resume_url`, which may be a full URL, a storage path or a filename,
   and looks in the candidate's storage folder if the column is empty. No résumé, or a 4xx
   link, deletes the row.
2. **URL.** A company-site link with `gh_jid` resolves through Greenhouse's public API to
   the embed form, `job-boards.greenhouse.io/embed/job_app?for=<board>&token=<id>`. The
   plain board URL is avoided because many companies redirect it to their own site.
3. **Liveness.** A 404, 410, closed-posting text, or a 404 from Greenhouse's API deletes the
   row, all before a browser session is paid for.
4. **Profile gaps.** A missing location or unusable phone gets a default (logged as `[Gate]`).
5. **Preflight.** Coverage and the portal circuit breaker. Knockouts are skipped when
   `POSITIVE_ANSWERS=1`.
6. **Browser session and landing gate.** A bot check waits 45 seconds for Kernel's solver,
   then retries on a residential proxy. A page with fewer than two kinds of application
   field (name, email, phone, résumé, LinkedIn) is deleted. Known ATS hosts pass.
7. **Pre-fill, then résumé upload.** Upload can trigger the site's autofill.
8. **Fill plan.** The email for the run is always the candidate's address from
   `proxy_emails`, whatever the queue row holds. A candidate with no address is blocked. Every field is routed (profile, bank, rule or LLM). A field that already
   has a value is **kept**. The one exception is email, which is always replaced with the
   proxy address, because autofill can write the personal one and codes then go astray.
   A required field nothing could answer gets a last-resort default.
9. **Submit.** Stagehand is disconnected, every email field on the page is checked and any
   other address replaced with the proxy (`[Email]`), then Submit is clicked, even if a field
   looks blank. The form rejects real blanks, and the retry fills what it named.
10. **OTP.** A 428 or code boxes triggers a wait of up to 5 minutes for the code, matched
    by recipient, company and time.
11. **Confirmation.** Looks for up to a minute for the form to vanish, a confirmation URL
    or confirmation text. The worker also marks rows completed when the employer's
    confirmation email arrives, checking every minute.

## Where each row ends up

Implemented by `decideRunAction` in `lib/run-outcome.ts`.

| Outcome | Status | Tab |
|---|---|---|
| Submission confirmed | `completed` | Done |
| Closed posting, not an application, no résumé | Row deleted, copied to `removed_applications` | None |
| Ordinary failure, tries left | `pending` after a 2-minute backoff | Pending |
| Kernel or rate-limit failure | `pending` after 5 minutes, **no try spent** | Pending |
| Submit clicked, no confirmation | `failed`, never retried automatically | Failed |
| Code never arrived | Retry, then `awaiting_otp` after 3 tries | OTP |
| Bot check | Retry on residential, then `awaiting_captcha` | CAPTCHA |
| Spam flag | One retry on a residential proxy, then `blocked` | Blocked |
| Login wall or other permanent failure | `blocked` | Blocked |

"Submit clicked, no confirmation" is never retried because it may have gone through, and a
retry would apply twice.

## Self-learning

The **Learning** tab in the sidebar shows all of this, and every number comes from real runs.

- **Site lessons** (`domain_skills`): what a run learned about a site, used by later runs and
  retired after three net-negative runs.
- **Answer bank** (`application_answers`): answers reused to avoid model calls. Phone, email,
  names and profile links are excluded and always come from the profile.
- **What to fix next** (`lib/run-health.ts`): failed fields, form rejections, last-resort
  answers and wasted refills, ranked by how many applications each touched.

Lessons and answers feed later runs automatically. "What to fix next" informs people: code
changes are still made by hand.

## Logs

Run logs are in `application_logs`, and in the worker's stdout if `KERNEL_CONSOLE_LOGS=1`.
Deleting a queue row deletes its logs too, so deleted rows are archived first.

| Tag | Meaning |
|---|---|
| `[Stage]` | Each step's start and result |
| `[Gate]` | Landing page verdict, URL resolution, profile defaults |
| `[Answer]` | A last-resort answer was used |
| `[Email]` | A non-proxy address was found and replaced, or all were confirmed correct |
| `[Refill]` | A field was written more than once, plus a per-run summary |
| `[Submission]` | Submit click, what the page showed, the verdict |
| `[PageScript]` | A browser script failed |
| `[Screen:...]` | Page URL, errors and text, plus a screenshot path |
| `[Timing]` | Slow scripts, and a per-run summary: scripts split into VM time and API or network wait, plus LLM, Stagehand and log-write time |
| `[Result]` | Final status, attempt, time and reason |

Screenshots are saved locally in `.run-screens/<application id>/`, after Submit and on
runs that didn't submit.

## Running it

```bash
npm run dev       # dashboard
npm run worker    # the worker, which starts claiming once Auto Start is on
npm test
```

`npm run dry-run -- 5` fills real forms without clicking Submit or sending email.

To stop safely, send `SIGTERM`: the worker stops claiming and gives runs up to 40 minutes to
finish. To undo a wrong deletion, reinsert `row_data` from `removed_applications` with
`status: pending`.

### Environment

| Variable | Purpose |
|---|---|
| `KERNEL_API_KEY` | Browsers. Overrides the value in `settings` |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Queue, logs, mail |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | LLM chain. `OPENAI_API_KEY` is optional |
| `RESEND_API_KEY` | Fallback lookup for verification codes |
| `POSITIVE_ANSWERS=1` | Favorable answers on eligibility questions, and skips knockouts. **Test setting: it asserts legal claims in the candidate's name** |
| `ANSWER_EVERY_FIELD=0` | Report unanswerable fields rather than using a default |
| `SUBMIT_WITH_BLANKS=0` | Refuse to click Submit with blanks showing |
| `KERNEL_BROWSER_POOL=1` | Warm pools. Off because idle browsers hold concurrency slots |
| `KERNEL_DRY_RUN=1` | Never click Submit or send email |
| `CAPTCHA_SOLVER_API_KEY` | CapSolver, for hCaptcha, reCAPTCHA, Turnstile and FunCaptcha. Not DataDome |

## Scaling: what is known

Measured on 6 November 2026, from a Mac in India to Kernel's default `us-east`.

| Sessions | `playwright.execute`, trivial script | Direct CDP, trivial script |
|---|---|---|
| 1 | 0.37 s | 0.28 s |
| 10 | 8.2 s | 0.28 s |
| 25 | 25.7 s, with 41 failed calls | 0.28 s |

- Script throughput stayed near 1 per second however many sessions ran, which is why runs
  crawl at high concurrency. **The cause is unknown.** Kernel documents no such limit, and
  these calls returned no rate-limit headers.
- LLM limits were **not** the bottleneck in the runs at 10 concurrency.
- CDP isn't an automatic fix. Kernel's docs warn that anti-bot vendors scan for it, and
  typing over it took about 13 s per script from India, one network trip per keystroke.
- Stagehand's docs don't address slowdowns across sessions.

**Worth trying next:** `ap-southeast` browsers, running the worker in `us-east` (Kernel Apps
allow 20 invocations per app on Start-Up), and combining steps into fewer scripts.

## Known problems

- **Spam flags on Ashby.** Flagged runs can't yet be told apart from ones that passed. Speed
  and IP were ruled out on the evidence so far. Stagehand's CDP connection is being tested.
- **DataDome.** Passing depends on Kernel's solver and a residential IP, and isn't proven.
- **Some inboxes get no codes.** One candidate's codes never arrived, for unknown reasons.
- **SmartRecruiters** hasn't had a completed application as of this writing.
