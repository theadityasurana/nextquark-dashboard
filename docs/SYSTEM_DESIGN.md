# NextQuark — System Design Documentation

> AI-powered automated job application platform with an admin dashboard for monitoring and controlling AI agents that autonomously fill and submit job applications across ATS portals.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Frontend Layer](#2-frontend-layer)
3. [API Layer](#3-api-layer)
4. [Automation Engine](#4-automation-engine)
5. [Database Schema](#5-database-schema)
6. [Email System](#6-email-system)
7. [External Integrations](#7-external-integrations)
8. [Key Design Patterns](#8-key-design-patterns)
9. [Data Flow Diagrams](#9-data-flow-diagrams)

---

## 1. High-Level Architecture

```mermaid
graph TB
    subgraph Client["Client (Browser / PWA)"]
        UI[Next.js 16 App Router]
    end

    subgraph Vercel["Vercel Edge"]
        MW[Middleware - Rate Limiter]
        API[API Route Handlers]
    end

    subgraph Supabase["Supabase (PostgreSQL)"]
        DB[(Database)]
        Storage[(Storage - Screenshots / Resumes)]
        EdgeFn[Edge Functions]
    end

    subgraph Automation["Automation Layer"]
        Kernel[Kernel Cloud Browser]
        Browserbase[Browserbase + Stagehand]
        BrowserUse[browser-use Agent]
    end

    subgraph LLM["LLM Providers"]
        OpenRouter[OpenRouter]
        Gemini[Google Gemini]
        OpenAI[OpenAI]
    end

    subgraph External["External Services"]
        Resend[Resend Email]
        CapSolver[CapSolver CAPTCHA]
        Telegram[Telegram Bot]
        MCP[MCP Server]
    end

    UI --> MW --> API
    API --> DB
    API --> Storage
    API --> Automation
    Automation --> LLM
    Automation --> CapSolver
    Automation --> DB
    API --> Resend
    API --> Telegram
    EdgeFn --> API
```

---

## 2. Frontend Layer

**Stack:** React 19, Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui (Radix UI), SWR

**PWA:** Service worker + web manifest, installable on mobile/desktop

**Deployment:** Vercel with `@vercel/analytics`

### Pages

| Route | Component | Purpose |
|---|---|---|
| `/` | `overview-screen.tsx` | Dashboard with stats, charts, recent activity |
| `/queue` | `queue-screen.tsx` | Live application queue with real-time updates |
| `/users` | `users-screen.tsx` | User profile management |
| `/companies` | `companies-screen.tsx` | Company + ATS portal config |
| `/jobs` | `jobs-screen.tsx` | Job listings with right-swipe tracking |
| `/agents` | `agents-screen.tsx` | AI agent status and configuration |
| `/analytics` | `analytics-screen.tsx` | Charts and performance metrics |
| `/emails` | `emails-screen.tsx` | Email campaign manager |
| `/otp-manager` | `otp-manager-screen.tsx` | OTP inbox viewer |
| `/logs` | `logs-screen.tsx` | Application run logs |
| `/pricing` | `pricing-screen.tsx` | Pricing management |
| `/settings` | `settings-screen.tsx` | API keys, provider toggle |

### State Management

```mermaid
graph LR
    DataProvider -->|SWR| CompaniesAPI["/api/companies"]
    DataProvider -->|SWR paginated| JobsAPI["/api/jobs"]
    DataProvider -->|SWR 10min refresh| QueueAPI["/api/applications/queue"]
    LogsProvider -->|streams| LogsAPI["/api/logs"]
    useQueueCount -->|polls| LiveCountAPI["/api/live-queue/count"]
    DashboardShell --> DataProvider
    DashboardShell --> LogsProvider
    DashboardShell --> useQueueCount
```

---

## 3. API Layer

All routes are Next.js Route Handlers under `/app/api/`. Rate-limited by `middleware.ts` via `lib/rate-limit.ts`.

### Core Data APIs

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/companies` | List all companies / create company |
| GET/PATCH | `/api/jobs` | List jobs (paginated) / update job |
| POST | `/api/jobs` | Create job |
| GET | `/api/users` | List users |
| GET/PATCH/DELETE | `/api/users/[id]` | Get / update / delete user |
| GET | `/api/applications/queue` | List application queue |
| GET/PATCH | `/api/applications/[id]` | Get / update application |
| GET | `/api/applications/progress` | Application progress stream |

### Automation APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auto-apply` | Trigger agent run for one application (supports SSE streaming) |
| POST | `/api/auto-apply-queue` | Batch dispatch from queue |
| GET | `/api/live-queue` | Get live queue entries |
| GET | `/api/live-queue/count` | Get pending count (used by sidebar badge) |

### ATS Sync APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/ats-sync` | Sync jobs for one company |
| POST | `/api/ats-sync-all` | Sync all companies |
| POST | `/api/sync-jobs` | Manual job sync trigger |
| POST | `/api/backfill-jobs` | Backfill missing job data |
| POST | `/api/cleanup-jobs` | Remove stale/expired jobs |

### Cron APIs (called by Vercel Cron / pg_cron)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cron/schedule-sync` | Schedule ATS sync jobs |
| GET | `/api/cron/process-sync` | Process pending sync queue |
| GET | `/api/cron/cleanup-rejected` | Purge old rejected applications |
| GET | `/api/cron/job-summary` | Send daily summary emails |
| GET | `/api/cron/watchdog` | Health watchdog |

### Email APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/email/broadcast` | Send broadcast campaign |
| POST | `/api/email/milestone` | Send milestone email |
| POST | `/api/email/rejection` | Send rejection notification |
| POST | `/api/email/inactivity` | Send inactivity nudge |
| POST | `/api/email/complete-profile` | Send profile completion prompt |
| GET/POST | `/api/email/templates` | List / create email templates |
| GET | `/api/email/logs` | Email delivery logs |
| POST | `/api/email/test` | Send test email |

### Webhook APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/webhooks/profile-created` | Supabase trigger on new user profile |
| POST | `/api/webhooks/resume-uploaded` | Triggers resume parsing pipeline |
| POST | `/api/webhooks/application-submitted` | Post-submission processing |
| POST | `/api/webhooks/resend` | Resend delivery event handler (Svix verified) |

### Utility APIs

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/api/settings` | Read / write global settings (API keys, provider) |
| GET/POST | `/api/settings/env-key` | Manage environment key overrides |
| GET | `/api/otp-manager` | Read OTP codes from proxy inbox |
| POST | `/api/scraper` | Scrape job details from URL |
| GET | `/api/system-health` | System health check |
| GET | `/api/portal-health` | ATS portal health check |
| GET | `/api/overview` | Aggregated dashboard stats (30s cache) |
| GET | `/api/analytics` | Analytics data |
| GET | `/api/logs` | Application logs |
| GET/POST | `/api/answer-bank` | Answer bank CRUD |
| GET/POST | `/api/agents` | Agent list and stats |
| POST | `/api/agents/create` | Create agent config |
| GET/POST | `/api/agents/config` | Agent configuration |
| GET | `/api/agents/performance` | Agent performance metrics |
| GET | `/api/pricing` | Pricing data |
| POST | `/api/upload` | File upload (resumes) |
| POST | `/api/setup` | Initial setup |
| GET/POST | `/api/notifications` | Push notifications |
| GET/POST | `/api/mcp/[transport]` | MCP server endpoint |

### API Flow — Auto Apply

```mermaid
sequenceDiagram
    participant Dashboard
    participant API as /api/auto-apply
    participant AutoProv as automation-provider.ts
    participant Kernel as Kernel Cloud Browser
    participant ATS as ATS Portal
    participant DB as Supabase DB

    Dashboard->>API: POST {userId, jobId, applicationData}
    API->>DB: Fetch profile if email missing
    API->>AutoProv: fillJobApplication(jobUrl, formData, streamCb, userId)
    AutoProv->>Kernel: Launch browser session
    Kernel->>ATS: Navigate to job URL
    ATS-->>Kernel: Page loaded
    Kernel->>ATS: Fill form fields
    Kernel->>ATS: Click Submit
    ATS-->>Kernel: Confirmation page
    Kernel-->>AutoProv: Result + recordingUrl
    AutoProv-->>API: {success, result, steps, recordingUrl}
    API-->>Dashboard: JSON response (or SSE stream)
    API->>DB: Update live_application_queue status
```

---

## 4. Automation Engine

The core is `lib/kernel.ts`. It orchestrates the entire browser automation pipeline for a single application run.

### Full Run Pipeline

```mermaid
flowchart TD
    A[Trigger: POST /api/auto-apply] --> B[Resolve API Keys from Supabase settings]
    B --> C[LLM Key Health Check\nProbe OpenRouter / Gemini / OpenAI]
    C --> D[Detect Portal Type\ndetectPortal from URL]
    D --> E[Get Portal Config\nmaxSteps, timeout, model, GPU, CUA]
    E --> F[Provision Kernel Browser\nwith profile + proxy settings]
    F --> G[Start Telemetry Stream\nbackground - logs clicks, nav, screenshots]
    G --> H[Navigate to Job URL]
    H --> I[Resolve Embedded Form\niframe / ATS embed detection]
    I --> J[Ensure Apply Form Open\nclick Apply button if needed]
    J --> K[Wait for Application Form\nverify inputs exist]
    K --> L[Pre-fill via Playwright\nname, email, phone, LinkedIn - human timing]
    L --> M[Scan Form Inventory\nall visible controls + honeypot filter]
    M --> N[AX Tree Scan\ncatch non-standard widgets]
    N --> O[Build Fill Plan\nresolve all answers before touching browser]
    O --> P{Answer Source?}
    P -->|Profile field| Q[Direct from user data]
    P -->|Known question| R[Answer bank recall]
    P -->|Custom question| S[LLM batch generation\none call for all]
    P -->|Sensitive| T[Flag for human review]
    Q & R & S & T --> U[Handler-based Fill Loop\ntext / dropdown / radio / checkbox / typeahead / date]
    U --> V{CAPTCHA detected?}
    V -->|Yes| W[Structural CAPTCHA detect\nreCAPTCHA v2/v3, hCAPTCHA, Turnstile]
    W --> X[CapSolver API\nsolve + inject token]
    X --> U
    V -->|No| Y{OTP prompt?}
    Y -->|Yes| Z[Fetch OTP via API\nfallback to admin panel reader]
    Z --> U
    Y -->|No| AA{Multi-page wizard?}
    AA -->|Yes| AB[classifyControl / decideNextStep\nclick Next / Save and Continue]
    AB --> M
    AA -->|No| AC[Pre-submit Audit\nauditForm - verify all required fields]
    AC --> AD{All fields filled?}
    AD -->|No| U
    AD -->|Yes| AE[clickSubmitButton\nhuman scroll + review delay]
    AE --> AF[confirmSubmission\nDOM/URL-based - never trusts agent]
    AF --> AG[Extract Confirmation ID\nATS-issued reference]
    AG --> AH[Write Run Timeline\nlive_application_queue.run_timeline JSONB]
    AH --> AI[Flush Log Batch\napplication_logs]
    AI --> AJ[Release Browser Profile Lock]
    AJ --> AK[Done]
```

### LLM Chain

```mermaid
flowchart LR
    A[Need LLM answer] --> B{OpenRouter key valid?}
    B -->|Yes| C[openrouter/gpt-4o-mini]
    C -->|fail| D[openrouter/gpt-4.1-mini]
    D -->|fail| E[openrouter/gemini-2.5-flash]
    E -->|fail| F{Gemini key valid?}
    B -->|No| F
    F -->|Yes| G[google/gemini-2.5-flash]
    G -->|fail - quota| H[gemini-2.0-flash]
    H -->|fail| I[gemini-1.5-flash]
    I -->|fail| J{OpenAI key valid?}
    F -->|No| J
    J -->|Yes| K[gpt-4.1-mini]
    K -->|fail| L[gpt-4o-mini]
    L -->|fail| M[Free OpenRouter models\nlive catalogue]
    M -->|all fail| N[Return empty - log error]
```

### Portal Configurations

| Portal | Max Steps | Timeout | GPU | CUA | DOM Settle |
|---|---|---|---|---|---|
| Greenhouse | 30 | 300s | No | No | 5000ms |
| Lever | 30 | 300s | No | No | 5000ms |
| Ashby | 30 | 300s | No | No | 5000ms |
| Workday | 40 | 600s | Yes | Yes | 8000ms |
| iCIMS | 35 | 480s | No | Yes | 5000ms |
| SmartRecruiters | 25 | 420s | No | No | 5000ms |
| LinkedIn | 25 | 480s | Yes | No | 5000ms |
| Default | 25 | 420s | No | No | 5000ms |

### Fill Plan Resolution

```mermaid
flowchart TD
    A[Form Inventory Item] --> B[routeField\nshape + label routing]
    B --> C{Route type?}
    C -->|file| D[skip - resume handled separately]
    C -->|sensitive| E[flag human-required blocker]
    C -->|profile| F{Answer bank hit?}
    C -->|deterministic| F
    C -->|consent| F
    C -->|choice| F
    C -->|skip| G{Required?}
    C -->|llm| H{Answer bank hit?}
    F -->|Yes| I[method: bank\nneedsReview if unconfirmed]
    F -->|No| J[method: profile/deterministic/consent/choice\nvalue from userData]
    G -->|Yes| K[method: unanswerable\nblocker set]
    G -->|No| L[method: skip]
    H -->|Yes| I
    H -->|No| M[Queue for LLM batch]
    M --> N[generateCustomAnswers\none batched call]
    N --> O[method: llm\nneedsReview: true]
    I & J & K & L & O --> P[validateAnswerForField\nreject mismatches]
    P --> Q[Final FieldPlan array]
```

### Automation Providers

The active provider is switchable from the sidebar without redeployment:

```mermaid
graph LR
    Settings["/api/settings\nautomationProvider"] --> AP[automation-provider.ts]
    AP -->|kernel| K[lib/kernel.ts\nKernel SDK]
    AP -->|browserbase| BB[lib/browserbase.ts\nBrowserbase + Stagehand]
    AP -->|browser_use| BU[lib/browser-use.ts\nbrowser-use agent]
```

---

## 5. Database Schema

Hosted on Supabase (PostgreSQL). RLS policies enforced on all tables. pg_cron handles scheduled jobs.

### Entity Relationship Diagram

```mermaid
erDiagram
    profiles {
        uuid id PK
        text name
        text email
        text phone
        text location
        text resume_url
        text linkedin_url
        text github_url
        text work_authorization_status
        text disability_status
        text veteran_status
        text gender
        text ethnicity
        jsonb top_skills
        jsonb experience
        jsonb education
        text proxy_email
        text verification_otp
        text automation_provider
        text browser_use_profile
        int total_apps
        int successful_apps
        bool is_premium
    }

    companies {
        uuid id PK
        text name
        text website
        text careers_url
        text linkedin_url
        text portal_type
        text portal_status
        text ats_type
        text ats_company_id
        timestamp last_synced_at
        text sync_status
        int total_jobs
    }

    jobs {
        uuid id PK
        uuid company_id FK
        text title
        text location
        text job_url
        text portal_url
        text status
        jsonb skills
        jsonb requirements
        text education_level
        text work_authorization
        int right_swipes
        timestamp posted_at
    }

    live_application_queue {
        uuid id PK
        uuid user_id FK
        uuid job_id FK
        text status
        text company_name
        text job_title
        text job_url
        text first_name
        text last_name
        text email
        text phone
        text location
        text resume_url
        text live_url
        text recording_url
        jsonb run_timeline
        text failed_step
        text confirmation_id
        float confirmation_confidence
        jsonb validation_errors
        int retry_count
        timestamp rejected_at
        bool is_premium
        timestamp created_at
        timestamp started_at
    }

    application_logs {
        text id PK
        timestamp timestamp
        text level
        text agent_id
        text message
        uuid application_id FK
    }

    agent_config {
        uuid id PK
        text name
        jsonb config
        bool is_active
    }

    performance_metrics {
        uuid id PK
        uuid application_id FK
        text portal_type
        int steps_taken
        int duration_ms
        bool submitted
        text failure_reason
    }

    settings {
        uuid id PK
        text kernelApiKey
        text geminiApiKey
        text openAiApiKey
        text openRouterApiKey
        text captchaSolverApiKey
        text automationProvider
        jsonb browserbaseConfig
    }

    answer_bank {
        uuid id PK
        uuid user_id FK
        text question
        text answer
        text employer
        text ats
        text scope
        bool confirmed
        timestamp created_at
    }

    domain_skills {
        uuid id PK
        text skill
        text domain
        float confidence
    }

    email_templates {
        uuid id PK
        text name
        text subject
        text html_body
        text type
        bool is_active
    }

    inbound_emails {
        uuid id PK
        text proxy_email
        text from_address
        text subject
        text body_text
        text extracted_otp
        uuid live_queue_id FK
        timestamp received_at
    }

    job_sync_queue {
        uuid id PK
        uuid company_id FK
        text status
        jsonb result
        timestamp synced_at
    }

    kernel_profile_locks {
        text lock_key PK
        timestamp locked_at
    }

    profiles ||--o{ live_application_queue : "applies"
    jobs ||--o{ live_application_queue : "applied to"
    companies ||--o{ jobs : "has"
    live_application_queue ||--o{ application_logs : "generates"
    live_application_queue ||--o{ performance_metrics : "measured by"
    profiles ||--o{ answer_bank : "owns"
    inbound_emails }o--|| live_application_queue : "linked to"
    companies ||--o{ job_sync_queue : "synced via"
```

### Key Tables

| Table | Purpose |
|---|---|
| `profiles` | User profiles — all personal data, resume URL, work auth, EEO fields |
| `companies` | Company + ATS portal config, sync status |
| `jobs` | Job listings with skills, requirements, ATS metadata |
| `live_application_queue` | Active/historical runs — status, timeline JSONB, OTP state, confirmation |
| `application_logs` | Per-run structured logs (batched writes, 25 per flush) |
| `agent_config` | Per-agent configuration |
| `performance_metrics` | Agent performance per run |
| `settings` | Global settings — API keys, active provider |
| `answer_bank` | Stored answers scoped by employer/ATS, reused across runs |
| `domain_skills` | Skill-to-domain classification for answer routing |
| `email_templates` | Transactional + campaign templates |
| `inbound_emails` | Proxy email inbox for OTP capture |
| `job_sync_queue` | ATS sync jobs processed by pg_cron |
| `kernel_profile_locks` | Distributed lock preventing concurrent browser profile writes |

---

## 6. Email System

```mermaid
flowchart LR
    API["/api/email/*"] --> Resend[Resend SDK]
    API --> Nodemailer[Nodemailer SMTP fallback]
    Resend --> Inbox[User Inbox]
    Inbox -->|delivery event| ResendWebhook["/api/webhooks/resend\nSvix verified"]
    ResendWebhook --> DB[(inbound_emails)]

    subgraph Email Types
        Milestone[Milestone - N applications submitted]
        Rejection[Rejection notification]
        Inactivity[Inactivity nudge]
        CompleteProfile[Complete profile prompt]
        Broadcast[Broadcast campaign]
    end
```

| Email Type | Trigger | Template |
|---|---|---|
| Milestone | N applications submitted | `milestone` |
| Rejection | Application rejected | `rejection` |
| Inactivity | User inactive X days | `inactivity` |
| Complete Profile | Profile incomplete | `complete-profile` |
| Broadcast | Manual operator send | `campaign` |

---

## 7. External Integrations

```mermaid
graph TB
    NQ[NextQuark API]

    NQ -->|browser sessions\nprofiles, telemetry| Kernel[Kernel\n@onkernel/sdk]
    NQ -->|alternative browser\nautomation| Browserbase[Browserbase\n+ Stagehand]
    NQ -->|primary LLM gateway| OpenRouter[OpenRouter\ngpt-4o-mini, gemini-2.5-flash]
    NQ -->|direct LLM fallback| Gemini[Google Gemini\ngemini-2.5-flash]
    NQ -->|direct LLM fallback| OpenAI[OpenAI\ngpt-4.1-mini, gpt-4o-mini]
    NQ -->|CAPTCHA solving| CapSolver[CapSolver\nreCAPTCHA, hCAPTCHA, Turnstile]
    NQ -->|transactional email| Resend[Resend]
    NQ -->|database, auth\nstorage, edge functions| Supabase[Supabase]
    NQ -->|operator alerts| Telegram[Telegram Bot]
    NQ -->|AI tooling endpoint| MCP[MCP Server\nModel Context Protocol]
    NQ -->|webhook verification| Svix[Svix]
```

| Service | SDK / Package | Role |
|---|---|---|
| Kernel | `@onkernel/sdk` | Cloud browser execution, persistent profiles, telemetry stream |
| Browserbase | `@browserbasehq/sdk` + `@browserbasehq/stagehand` | Alternative browser automation |
| OpenRouter | REST API | Primary LLM gateway — GPT-4o-mini, Gemini 2.5 Flash |
| Google Gemini | REST API | Direct LLM fallback |
| OpenAI | REST API | Direct LLM fallback |
| CapSolver | REST API | CAPTCHA solving — reCAPTCHA v2/v3, hCAPTCHA, Turnstile |
| Resend | `resend` | Transactional email delivery |
| Supabase | `@supabase/supabase-js` | Database, auth, file storage, edge functions |
| Telegram | REST API | Webhook notifications to operators |
| MCP | `@modelcontextprotocol/sdk` | Model Context Protocol server |
| Svix | `svix` | Webhook signature verification |

---

## 8. Key Design Patterns

### Batched Log Writes

Logs are queued in-memory and flushed in batches of 25 to avoid per-line DB round-trips on the critical path of a run.

```
logQueue[] → scheduleLogFlush (1200ms debounce) → supabase.insert(batch)
                                                 ↑
                              flushLogs() awaited at run end
```

### Distributed Concurrency Gate

`lib/distributed-gate.ts` + `lib/kernel-limits.ts` enforce per-plan concurrency limits across workers. The Kernel plan's concurrency limit is read once and cached; the gate prevents over-dispatching.

### Circuit Breaker

`lib/circuit-breaker.ts` wraps external service calls. After N consecutive failures the circuit opens and fast-fails subsequent calls for a cooldown period, preventing cascading failures.

### Answer Bank

`lib/answer-bank-store.ts` persists answers to custom questions scoped by employer and ATS. On subsequent runs for the same employer, recalled answers skip the LLM call entirely.

```mermaid
flowchart LR
    Q[Custom question] --> Recall{answer_bank\nlookup}
    Recall -->|hit, confirmed| Use[Use directly\nmethod: bank]
    Recall -->|hit, unconfirmed| UseReview[Use + flag needsReview]
    Recall -->|miss| LLM[LLM generation]
    LLM --> Store[Store in answer_bank]
    Store --> Use
```

### Honeypot Detection

`lib/honeypot.ts` inspects each form control's geometry and CSS before it enters the fill plan. Off-canvas, zero-opacity, or overflow-clipped fields are excluded — filling them is a reliable bot signal.

### Fill Plan (Resolve-then-Execute)

All answers are resolved into a `FieldPlan[]` before the browser is touched. The fill loop is pure execution with no mid-fill reasoning. This separates the "what to answer" problem from the "how to interact" problem.

### Handler Dispatch

`lib/field-handlers/` provides typed, unit-tested handlers per widget type. `selectHandler(descriptor)` picks the right one; `buildHandlerProgram` generates the VM code. No monolithic fill function.

| Handler | Widget types |
|---|---|
| `text.ts` | `input[type=text]`, `textarea` |
| `dropdown.ts` | `select`, custom listbox |
| `radio.ts` | `input[type=radio]`, `role=radiogroup` |
| `checkbox.ts` | `input[type=checkbox]` |
| `typeahead.ts` | `role=combobox`, autocomplete inputs |
| `buttongroup.ts` | Ashby-style `aria-pressed` button rows |
| `date.ts` | `input[type=date]`, date pickers |

---

## 9. Data Flow Diagrams

### End-to-End Application Submission

```mermaid
sequenceDiagram
    participant User as User Profile
    participant Queue as live_application_queue
    participant API as /api/auto-apply
    participant Engine as kernel.ts
    participant Browser as Kernel Browser
    participant ATS as ATS Portal
    participant LLM as LLM Chain
    participant Logs as application_logs

    Queue->>API: Dispatch pending entry
    API->>Engine: fillJobApplication(url, userData)
    Engine->>Engine: Resolve API keys (cached)
    Engine->>LLM: Probe key health
    Engine->>Browser: Launch session (portal config)
    Browser->>ATS: Navigate to job URL
    Engine->>Browser: Pre-fill standard fields (Playwright)
    Engine->>Browser: Scan form inventory
    Browser-->>Engine: InventoryItem[]
    Engine->>LLM: Batch generate custom answers
    LLM-->>Engine: answers{}
    Engine->>Engine: Build FieldPlan[]
    loop For each field in plan
        Engine->>Browser: fillFieldWithHandler(key, value)
        Browser->>ATS: Interact with control
        Browser-->>Engine: HandlerResult
        Engine->>Logs: persistLog (batched)
    end
    Engine->>Browser: auditForm()
    Browser-->>Engine: unfilledFields[]
    Engine->>Browser: clickSubmitButton()
    Browser->>ATS: Click Submit
    ATS-->>Browser: Confirmation page
    Engine->>Browser: confirmSubmission()
    Browser-->>Engine: {submitted, confidence, confirmationId}
    Engine->>Queue: Update status + run_timeline
    Engine->>Logs: flushLogs()
```

### ATS Sync Flow

```mermaid
flowchart TD
    Cron["/api/cron/schedule-sync\npg_cron every N hours"] --> SyncQueue[(job_sync_queue\ninsert pending rows)]
    SyncQueue --> ProcessCron["/api/cron/process-sync\npick up pending rows"]
    ProcessCron --> ATSSync["/api/ats-sync\nper company"]
    ATSSync --> ATS[ATS API\nGreenhouse / Lever / Ashby etc]
    ATS --> Jobs[(jobs table\nupsert)]
    ATSSync --> SyncQueue2[(job_sync_queue\nmark done + result)]
```

### OTP Handling Flow

```mermaid
flowchart TD
    A[OTP prompt detected on page] --> B[detectOtpOnPage\ncode input + page copy]
    B --> C[fetchOtpViaApi\ncheck proxy inbox API]
    C -->|found| G[Fill OTP field]
    C -->|not found| D[fetchOtpFromAdminPanel\nopen admin.nextquark.in/otp-manager in new tab]
    D -->|found| G
    D -->|not found| E[Wait + retry up to 5x]
    E -->|timeout| F[Status: awaiting_captcha\nhuman intervention]
    G --> H[Continue fill loop]
```

### Email Lifecycle

```mermaid
flowchart LR
    App[Application event] --> Trigger{Event type}
    Trigger -->|submitted N apps| Milestone["/api/email/milestone"]
    Trigger -->|rejected| Rejection["/api/email/rejection"]
    Trigger -->|inactive X days| Inactivity["/api/email/inactivity"]
    Trigger -->|profile incomplete| Complete["/api/email/complete-profile"]
    Milestone & Rejection & Inactivity & Complete --> Resend[Resend API]
    Resend --> UserInbox[User Inbox]
    Resend -->|delivery webhook| ResendHook["/api/webhooks/resend"]
    ResendHook --> DB[(inbound_emails)]
```

---

*Generated from source: `/Users/adityasurana7/Desktop/nextquark-dashboard`*
