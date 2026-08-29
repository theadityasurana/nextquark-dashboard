# NextQuark — API Reference

> All endpoints are under the base URL of the deployed Next.js app (e.g. `https://admin.nextquark.in`).
> All `/api/*` routes are rate-limited by `middleware.ts`.

---

## Table of Contents

1. [Core Data](#1-core-data)
2. [Automation](#2-automation)
3. [ATS Sync](#3-ats-sync)
4. [Cron Jobs](#4-cron-jobs)
5. [Email](#5-email)
6. [Webhooks](#6-webhooks)
7. [Utilities](#7-utilities)
8. [Agents](#8-agents)
9. [MCP](#9-mcp)

---

## 1. Core Data

### Companies

#### `GET /api/companies`

Returns all companies.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `all` | boolean | false | Return all records without pagination |
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Records per page |

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Acme Corp",
    "website": "https://acme.com",
    "careersUrl": "https://acme.com/careers",
    "portalType": "Greenhouse",
    "portalStatus": "active",
    "atsType": "greenhouse",
    "atsCompanyId": "acme",
    "totalJobs": 12,
    "syncStatus": "synced",
    "lastSyncedAt": "2025-01-01T00:00:00Z"
  }
]
```

#### `POST /api/companies`

Create a new company.

**Body:**
```json
{
  "name": "Acme Corp",
  "website": "https://acme.com",
  "careersUrl": "https://acme.com/careers",
  "portalType": "Greenhouse",
  "atsType": "greenhouse",
  "atsCompanyId": "acme"
}
```

---

### Jobs

#### `GET /api/jobs`

Returns paginated job listings.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Records per page |
| `companyId` | string | — | Filter by company |
| `status` | string | — | Filter by status |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "companyName": "Acme Corp",
      "title": "Senior Engineer",
      "location": "Remote",
      "jobUrl": "https://boards.greenhouse.io/acme/jobs/123",
      "status": "queued",
      "rightSwipes": 5,
      "skills": ["TypeScript", "React"],
      "postedAt": "2025-01-01"
    }
  ],
  "total": 150
}
```

#### `POST /api/jobs`

Create a new job.

**Body:**
```json
{
  "companyId": "uuid",
  "title": "Senior Engineer",
  "location": "Remote",
  "jobUrl": "https://boards.greenhouse.io/acme/jobs/123",
  "skills": ["TypeScript", "React"]
}
```

#### `PATCH /api/jobs`

Update a job.

**Body:**
```json
{
  "id": "uuid",
  "status": "active",
  "rightSwipes": 6
}
```

---

### Users

#### `GET /api/users`

Returns all user profiles.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+1234567890",
    "location": "San Francisco, CA",
    "totalApps": 42,
    "successfulApps": 38,
    "isPremium": true
  }
]
```

#### `GET /api/users/[id]`

Get a single user profile.

#### `PATCH /api/users/[id]`

Update a user profile.

#### `DELETE /api/users/[id]`

Delete a user profile.

---

### Applications

#### `GET /api/applications/queue`

Returns the application queue.

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "userName": "Jane Doe",
      "companyName": "Acme Corp",
      "jobTitle": "Senior Engineer",
      "status": "pending",
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### `GET /api/applications/[id]`

Get a single application with full details including run timeline.

#### `PATCH /api/applications/[id]`

Update application status or metadata.

**Body:**
```json
{
  "status": "completed",
  "confirmationId": "APP-12345"
}
```

#### `GET /api/applications/progress`

Server-Sent Events stream of application progress updates.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `applicationId` | string | Application ID to stream |

---

## 2. Automation

### `POST /api/auto-apply`

Trigger an AI agent run for a single application. Supports both JSON and SSE streaming responses.

**Body:**
```json
{
  "userId": "uuid",
  "jobId": "uuid",
  "stream": false,
  "applicationData": {
    "first_name": "Jane",
    "last_name": "Doe",
    "email": "jane@example.com",
    "phone": "+1234567890",
    "location": "San Francisco, CA",
    "job_url": "https://boards.greenhouse.io/acme/jobs/123",
    "job_title": "Senior Engineer",
    "company_name": "Acme Corp",
    "resume_url": "resumes/jane-doe.pdf",
    "linkedin_url": "https://linkedin.com/in/janedoe",
    "work_authorization_status": "Authorized",
    "top_skills": ["TypeScript", "React"],
    "experience": [...],
    "education": [...]
  }
}
```

**Response (JSON):**
```json
{
  "success": true,
  "message": "Application submitted successfully",
  "user": "Jane Doe",
  "job": "Senior Engineer",
  "company": "Acme Corp",
  "result": "Application submitted",
  "steps": 12,
  "recordingUrl": "https://..."
}
```

**Response (SSE stream, `stream: true`):**
```
data: {"status":"step","message":"Navigating to job URL"}

data: {"status":"step","message":"Pre-filling standard fields"}

data: {"status":"completed","success":true,"steps":12,"recordingUrl":"https://..."}
```

---

### `POST /api/auto-apply-queue`

Batch dispatch — picks up pending entries from `live_application_queue` and triggers runs.

**Body:**
```json
{
  "limit": 5,
  "premiumOnly": false
}
```

---

### `GET /api/live-queue`

Returns current live queue entries with status.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter: `pending`, `processing`, `completed`, `failed` |
| `limit` | number | Max records |

---

### `GET /api/live-queue/count`

Returns the count of pending applications. Used by the sidebar badge.

**Response:**
```json
{ "count": 7 }
```

---

## 3. ATS Sync

### `POST /api/ats-sync`

Sync jobs for a single company from its ATS.

**Body:**
```json
{ "companyId": "uuid" }
```

**Response:**
```json
{
  "added": 5,
  "updated": 2,
  "deleted": 1,
  "companyId": "uuid"
}
```

---

### `POST /api/ats-sync-all`

Sync all companies that have ATS configured.

**Response:**
```json
{
  "synced": 12,
  "failed": 1,
  "results": [...]
}
```

---

### `POST /api/sync-jobs`

Manual trigger to sync jobs for specific companies.

### `POST /api/backfill-jobs`

Backfill missing fields (skills, requirements) on existing job records.

### `POST /api/cleanup-jobs`

Remove expired or stale job listings.

---

## 4. Cron Jobs

These endpoints are called by Vercel Cron or pg_cron. They are protected and should not be called manually in production.

| Endpoint | Schedule | Description |
|---|---|---|
| `GET /api/cron/schedule-sync` | Every 6h | Insert pending rows into `job_sync_queue` |
| `GET /api/cron/process-sync` | Every 15min | Process up to N pending sync rows |
| `GET /api/cron/cleanup-rejected` | Daily | Purge rejected applications older than 30 days |
| `GET /api/cron/job-summary` | Daily 9am | Send daily summary email to operators |
| `GET /api/cron/watchdog` | Every 5min | Health watchdog — restart stalled runs |

---

## 5. Email

### `POST /api/email/broadcast`

Send a broadcast email to a segment of users.

**Body:**
```json
{
  "templateId": "uuid",
  "segment": "all",
  "subject": "New jobs available",
  "previewText": "Check out these new opportunities"
}
```

---

### `POST /api/email/milestone`

Send a milestone email when a user reaches N applications.

**Body:**
```json
{
  "userId": "uuid",
  "milestone": 10
}
```

---

### `POST /api/email/rejection`

Send a rejection notification.

**Body:**
```json
{
  "userId": "uuid",
  "applicationId": "uuid",
  "companyName": "Acme Corp",
  "jobTitle": "Senior Engineer"
}
```

---

### `POST /api/email/inactivity`

Send an inactivity nudge.

**Body:**
```json
{
  "userId": "uuid",
  "daysSinceLastActivity": 7
}
```

---

### `POST /api/email/complete-profile`

Send a profile completion prompt.

**Body:**
```json
{ "userId": "uuid" }
```

---

### `GET /api/email/templates`

List all email templates.

### `POST /api/email/templates`

Create or update an email template.

**Body:**
```json
{
  "name": "milestone",
  "subject": "You've applied to {{count}} jobs!",
  "htmlBody": "<html>...</html>",
  "type": "transactional"
}
```

---

### `GET /api/email/logs`

Returns email delivery logs.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `userId` | string | Filter by user |
| `type` | string | Filter by email type |
| `limit` | number | Max records |

---

### `POST /api/email/test`

Send a test email to verify template rendering.

**Body:**
```json
{
  "templateId": "uuid",
  "to": "test@example.com"
}
```

---

## 6. Webhooks

All webhook endpoints verify signatures before processing.

### `POST /api/webhooks/profile-created`

Called by Supabase trigger when a new user profile is created. Initializes the application queue entry and sends a welcome email.

**Headers:** `svix-id`, `svix-timestamp`, `svix-signature`

---

### `POST /api/webhooks/resume-uploaded`

Called when a resume file is uploaded to Supabase Storage. Triggers resume parsing via `lib/resume-parser.ts`.

**Body:**
```json
{
  "userId": "uuid",
  "resumePath": "resumes/uuid/resume.pdf"
}
```

---

### `POST /api/webhooks/application-submitted`

Called after a successful application submission. Updates stats and triggers milestone check.

**Body:**
```json
{
  "applicationId": "uuid",
  "userId": "uuid",
  "companyName": "Acme Corp",
  "jobTitle": "Senior Engineer",
  "confirmationId": "APP-12345"
}
```

---

### `POST /api/webhooks/resend`

Resend email delivery event handler. Verified via Svix.

**Events handled:** `email.sent`, `email.delivered`, `email.bounced`, `email.complained`

---

## 7. Utilities

### `GET /api/overview`

Aggregated dashboard stats. Cached for 30 seconds.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `chartRange` | string | `24h` | `1h`, `24h`, `7d`, `30d` |
| `companyRange` | string | `24h` | Same options |
| `agentRange` | string | `24h` | Same options |
| `jobRange` | string | `7d` | Same options |

**Response:**
```json
{
  "stats": {
    "totalAll": 1200,
    "totalToday": 45,
    "activeNow": 3,
    "completedAll": 1100,
    "completedToday": 40,
    "failedAll": 100,
    "failedToday": 5,
    "successRate": "91.7",
    "totalJobs": 350
  },
  "recentApps": [...],
  "applicationsChart": [...],
  "topCompanies": [...],
  "agents": [...],
  "portalHealth": [...],
  "userActivity": [...],
  "jobInsights": [...],
  "syncActivity": {...},
  "logs": [...]
}
```

---

### `GET /api/analytics`

Analytics data for the analytics screen.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `range` | string | `7d`, `30d`, `90d` |

---

### `GET /api/logs`

Application run logs.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `applicationId` | string | Filter by application |
| `level` | string | `info`, `warn`, `error` |
| `limit` | number | Max records (default 100) |
| `offset` | number | Pagination offset |

---

### `GET /api/otp-manager`

Read OTP codes from the proxy email inbox.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `applicationId` | string | Match by queue ID |
| `proxyEmail` | string | Match by proxy address |

**Response:**
```json
{
  "otp": "847291",
  "receivedAt": "2025-01-01T00:00:00Z",
  "fromAddress": "noreply@greenhouse.io"
}
```

---

### `POST /api/scraper`

Scrape job details from a URL.

**Body:**
```json
{ "url": "https://boards.greenhouse.io/acme/jobs/123" }
```

**Response:**
```json
{
  "title": "Senior Engineer",
  "company": "Acme Corp",
  "location": "Remote",
  "description": "...",
  "requirements": [...],
  "skills": [...]
}
```

---

### `GET /api/system-health`

System health check — verifies DB connectivity, storage, and key services.

**Response:**
```json
{
  "status": "healthy",
  "db": "ok",
  "storage": "ok",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

---

### `GET /api/portal-health`

ATS portal health — checks response times and failure rates.

**Response:**
```json
[
  {
    "portalType": "Greenhouse",
    "avgResponseTime": 1200,
    "failureRate": "2.1",
    "status": "active"
  }
]
```

---

### `GET /api/settings`

Read global settings (API keys are masked).

**Response:**
```json
{
  "automationProvider": "kernel",
  "kernelApiKey": "***...abc",
  "geminiApiKey": "***...xyz",
  "openAiApiKey": "***...def",
  "openRouterApiKey": "***...ghi",
  "captchaSolverApiKey": "***...jkl"
}
```

### `POST /api/settings`

Update global settings.

**Body:**
```json
{
  "automationProvider": "browserbase",
  "kernelApiKey": "sk-...",
  "geminiApiKey": "AIza..."
}
```

---

### `GET/POST /api/answer-bank`

Manage the answer bank for custom questions.

**GET query params:**
| Param | Type | Description |
|---|---|---|
| `userId` | string | Filter by user |
| `employer` | string | Filter by employer |

**POST body:**
```json
{
  "userId": "uuid",
  "question": "Why do you want to work here?",
  "answer": "I admire your mission...",
  "employer": "Acme Corp",
  "ats": "Greenhouse",
  "confirmed": true
}
```

---

### `POST /api/upload`

Upload a file (resume) to Supabase Storage.

**Content-Type:** `multipart/form-data`

**Form fields:**
| Field | Description |
|---|---|
| `file` | The file to upload |
| `userId` | Owner user ID |
| `type` | `resume` |

**Response:**
```json
{
  "path": "resumes/uuid/resume.pdf",
  "url": "https://..."
}
```

---

### `GET /api/notifications`

Get push notification subscriptions.

### `POST /api/notifications`

Register a push notification subscription (Web Push).

**Body:**
```json
{
  "subscription": { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
}
```

---

## 8. Agents

### `GET /api/agents`

Returns agent list with stats from `live_application_queue`.

**Query params:**
| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | 1 | Page number |
| `limit` | number | 10 | Records per page |
| `status` | string | `all` | `active`, `idle`, `completed`, `error` |

**Response:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "status": "processing",
      "firstName": "Jane",
      "lastName": "Doe",
      "email": "jane@example.com",
      "companyName": "Acme Corp",
      "jobTitle": "Senior Engineer",
      "duration": "3m 42s",
      "liveUrl": "https://...",
      "recordingUrl": "https://..."
    }
  ],
  "stats": {
    "total": 1200,
    "active": 3,
    "idle": 7,
    "completed": 1100,
    "error": 100,
    "successRate": "91.7"
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1200,
    "totalPages": 120
  }
}
```

---

### `GET /api/agents/config`

Get agent configuration.

### `POST /api/agents/config`

Update agent configuration.

**Body:**
```json
{
  "maxConcurrent": 5,
  "defaultPortalConfig": { "maxSteps": 30, "timeout": 300 }
}
```

---

### `POST /api/agents/create`

Create a new agent entry.

### `GET /api/agents/performance`

Get agent performance metrics.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `range` | string | `24h`, `7d`, `30d` |
| `portalType` | string | Filter by ATS portal |

---

### `GET /api/pricing`

Get pricing configuration and plan data.

---

## 9. MCP

### `GET/POST /api/mcp/[transport]`

Model Context Protocol server endpoint. Supports `sse` and `streamable-http` transports.

Used by AI tooling (e.g. Claude Desktop, Cursor) to interact with NextQuark data programmatically.

**Transport options:**
- `sse` — Server-Sent Events transport
- `streamable-http` — Streamable HTTP transport

---

*Base URL: `https://admin.nextquark.in` (or your deployment URL)*
*All endpoints require the app to be running and Supabase to be reachable.*
