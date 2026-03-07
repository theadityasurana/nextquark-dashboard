# Overview Page - Complete Implementation Documentation

## 🔄 Real-Time Data Refresh
**Auto-refresh: Every 5 seconds**
- All data on the overview page refreshes automatically every 5 seconds
- Implemented via `setInterval` in the React component
- API endpoint: `/api/overview` with query parameters for time ranges

---

## 📊 Section-by-Section Breakdown

### 1. **Stats Cards (6 Cards at Top)**

#### Card 1: Total Applications (All Time)
- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table in Supabase
- **Query**: `SELECT COUNT(*) FROM live_application_queue`
- **What it means**: Total number of job applications ever submitted through your system
- **Updates**: Real-time (every 5 seconds)
- **Data Flow**: 
  ```
  Supabase → /api/overview → React State → UI
  ```

#### Card 2: Today
- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Query**: `SELECT COUNT(*) FROM live_application_queue WHERE created_at >= TODAY`
- **What it means**: Number of applications submitted today (resets at midnight)
- **Updates**: Real-time (every 5 seconds)

#### Card 3: Active Now
- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Query**: `SELECT COUNT(*) FROM live_application_queue WHERE status = 'processing'`
- **What it means**: Applications currently being processed by AI agents right now
- **Updates**: Real-time (every 5 seconds)
- **Note**: This number changes as applications start/complete

#### Card 4: Success Rate
- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Calculation**: `(completed_count / total_count) * 100`
- **Query**: 
  ```sql
  SELECT 
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) as total
  FROM live_application_queue
  ```
- **What it means**: Percentage of applications that successfully completed vs total attempts
- **Sub-text**: Shows "X/Y" (completed out of total)
- **Updates**: Real-time (every 5 seconds)

#### Card 5: Failed (All Time)
- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Query**: `SELECT COUNT(*) FROM live_application_queue WHERE status = 'failed'`
- **What it means**: Total number of applications that failed (all time)
- **Updates**: Real-time (every 5 seconds)

#### Card 6: Failed (Today)
- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Query**: `SELECT COUNT(*) FROM live_application_queue WHERE status = 'failed' AND created_at >= TODAY`
- **What it means**: Number of failed applications today only
- **Updates**: Real-time (every 5 seconds)

---

### 2. **Live Application Stream**

- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Query**: `SELECT * FROM live_application_queue ORDER BY created_at DESC LIMIT 10`
- **What it shows**: Last 10 applications submitted (most recent first)
- **Updates**: Real-time (every 5 seconds)

**Data Displayed Per Row**:
1. **Time**: When application started (or created if not started yet)
2. **User Name**: `first_name + last_name` from the application
3. **Company**: `company_name` field
4. **Job Title**: `job_title` field
5. **Status Badge**: Current status (pending/processing/completed/failed)

**Data Flow**:
```
live_application_queue table
  ↓
API transforms to display format:
  - Formats timestamps to HH:MM:SS
  - Combines first_name + last_name
  - Extracts company_name, job_title, status
  ↓
React component renders in real-time
```

---

### 3. **Applications Over Time Chart**

- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Time Range Filter**: User selectable (1h, 24h, 7d, 30d)
- **Updates**: Real-time (every 5 seconds) + when filter changes

**How it works**:

#### For "Last Hour" (1h):
- **Query**: `SELECT created_at FROM live_application_queue WHERE created_at >= NOW() - INTERVAL '1 hour'`
- **Grouping**: By hour
- **Display**: Shows last 6 hours with application count per hour
- **X-axis**: Time labels (e.g., "10am", "11am", "12pm")
- **Y-axis**: Number of applications

#### For "Last 24h" (24h):
- **Query**: `SELECT created_at FROM live_application_queue WHERE created_at >= NOW() - INTERVAL '24 hours'`
- **Grouping**: By hour
- **Display**: Shows last 10 hours
- **What it means**: Application volume throughout the day

#### For "Last 7 Days" (7d):
- **Query**: `SELECT created_at FROM live_application_queue WHERE created_at >= NOW() - INTERVAL '7 days'`
- **Grouping**: By day of week
- **Display**: Shows 7 days (Mon, Tue, Wed, etc.)
- **What it means**: Weekly application trends

#### For "Last 30 Days" (30d):
- **Query**: `SELECT created_at FROM live_application_queue WHERE created_at >= NOW() - INTERVAL '30 days'`
- **Grouping**: By date
- **Display**: Shows dates (e.g., "Jan 1", "Jan 2")
- **What it means**: Monthly application patterns

**Data Processing**:
```javascript
// Backend groups data by time period
const hourlyMap = new Map()
chartData.forEach(app => {
  const hour = new Date(app.created_at).getHours()
  hourlyMap.set(hour, (hourlyMap.get(hour) || 0) + 1)
})
// Returns array: [{ time: "10am", count: 5 }, { time: "11am", count: 8 }, ...]
```

---

### 4. **Top Companies**

- **Real Data**: ✅ YES
- **Source**: `live_application_queue` table
- **Time Range Filter**: User selectable (24h, 7d, 30d)
- **Updates**: Real-time (every 5 seconds) + when filter changes

**Query Logic**:
```sql
SELECT 
  company_name,
  COUNT(*) as total_apps,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_apps
FROM live_application_queue
WHERE created_at >= [time_range_start]
GROUP BY company_name
ORDER BY total_apps DESC
LIMIT 5
```

**Data Displayed Per Company**:
1. **Rank**: 1, 2, 3, 4, 5
2. **Logo Initial**: First letter of company name
3. **Company Name**: From `company_name` field
4. **Apps Count**: Number of applications to this company in selected time range
5. **Success Rate**: `(completed / total) * 100`

**What it means**: 
- Shows which companies you're applying to most frequently
- Success rate helps identify which companies have easier/harder application processes
- Time range filter lets you see trends (e.g., "focused on FAANG this week")

---

### 5. **Portal Health Status**

- **Real Data**: ✅ YES (after applications run)
- **Source**: `portal_metrics` table in Supabase
- **Query**: 
  ```sql
  SELECT 
    portal_type,
    AVG(response_time_ms) as avg_response_time,
    COUNT(*) FILTER (WHERE status = 'failure') as failures,
    COUNT(*) as total
  FROM portal_metrics
  WHERE timestamp >= NOW() - INTERVAL '24 hours'
  GROUP BY portal_type
  ```
- **Updates**: Real-time (every 5 seconds)

**Data Displayed Per Portal**:
1. **Portal Type**: Greenhouse, Lever, Workday, LinkedIn, etc.
2. **Status Badge**: 
   - 🟢 **Active**: Failure rate < 30%, avg response < 5000ms
   - 🟡 **Slow**: Avg response time > 5000ms
   - 🔴 **Down**: Failure rate > 30%
3. **Avg Response Time**: Average time to complete application (in milliseconds)
4. **Failure Rate**: Percentage of failed applications

**How Data is Collected**:
```javascript
// In browser-use.ts, after each application:
await supabase.from('portal_metrics').insert({
  portal_type: 'Greenhouse',        // Detected from URL
  application_id: applicationId,     // UUID of application
  response_time_ms: 45000,          // Time taken (45 seconds)
  status: 'success',                // or 'failure', 'timeout'
  error_message: null               // Error if failed
})
```

**What it means**:
- **Portal Type**: Which job application system (ATS) was used
- **Response Time**: How long the portal takes to process applications
- **Failure Rate**: Reliability of each portal
- **Use Case**: Identify problematic portals, optimize application strategy

**Empty State**: Shows "No portal data available yet" until applications are processed

---

### 6. **Most Active Users**

- **Real Data**: ✅ YES (after users table is populated)
- **Source**: `users` table in Supabase
- **Query**: 
  ```sql
  SELECT 
    id, name, email, 
    total_apps, successful_apps
  FROM users
  ORDER BY total_apps DESC
  LIMIT 5
  ```
- **Updates**: Real-time (every 5 seconds)

**Data Displayed Per User**:
1. **Rank**: 1-5
2. **Name**: User's full name
3. **Email**: User's email address
4. **Total Apps**: Number of applications submitted by this user
5. **Success Rate**: `(successful_apps / total_apps) * 100`

**How User Stats are Updated**:
```sql
-- Automatic trigger in Supabase
CREATE TRIGGER trigger_update_user_stats
  AFTER INSERT OR UPDATE ON live_application_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats();

-- Function logic:
-- On INSERT: total_apps++, in_progress_apps++
-- On UPDATE to 'completed': successful_apps++, in_progress_apps--
-- On UPDATE to 'failed': failed_apps++, in_progress_apps--
```

**What it means**:
- Shows which users are most actively applying to jobs
- Success rate indicates which users have better application completion rates
- Helps identify power users vs casual users

**Empty State**: Shows "No user data available" until users are created in the `users` table

**Note**: Users must be manually created in the `users` table. The trigger only updates stats, it doesn't create users.

---

### 7. **Most Applied Jobs**

- **Real Data**: ✅ YES
- **Source**: `live_application_queue` + `jobs` tables (joined)
- **Time Range Filter**: User selectable (24h, 7d, 30d)
- **Updates**: Real-time (every 5 seconds) + when filter changes

**Query Logic**:
```sql
-- Get application counts
SELECT 
  job_id,
  job_title,
  company_name,
  COUNT(*) as application_count,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_count
FROM live_application_queue
WHERE created_at >= [time_range_start]
GROUP BY job_id, job_title, company_name

-- Join with jobs table for right_swipes
LEFT JOIN jobs ON live_application_queue.job_id = jobs.id
```

**Data Displayed Per Job**:
1. **Rank**: 1-5
2. **Job Title**: From `job_title` field
3. **Company**: From `company_name` field
4. **Applications**: Number of times this job was applied to
5. **Right Swipes**: From `jobs.right_swipes` (number of users who swiped right/interested)
6. **Success Rate**: `(completed / applications) * 100`

**What it means**:
- **Applications**: How many times people applied to this specific job
- **Right Swipes**: How many users showed interest (from job browsing feature)
- **Success Rate**: How often applications to this job complete successfully
- **Use Case**: Identify popular jobs, see which jobs have easier application processes

**Empty State**: Shows "No job data available for selected time range"

---

### 8. **AI Agent Status**

- **Real Data**: ✅ YES (derived from applications)
- **Source**: `live_application_queue` table
- **Time Range Filter**: User selectable (1h, 24h, 7d)
- **Updates**: Real-time (every 5 seconds) + when filter changes

**How Agents are Derived**:
```javascript
// Backend logic:
// 1. Get all processing applications in time range
const processingApps = await supabase
  .from('live_application_queue')
  .select('*')
  .eq('status', 'processing')
  .gte('created_at', timeRangeStart)

// 2. Each processing app = 1 active agent
const agents = processingApps.map((app, i) => ({
  id: `Agent-${i + 1}`,
  status: 'active',
  currentJob: `${app.company_name} - ${app.job_title}`,
  currentUser: `${app.first_name} ${app.last_name[0]}.`
}))

// 3. Get recently completed apps for idle agents
const completedApps = await supabase
  .from('live_application_queue')
  .select('*')
  .eq('status', 'completed')
  .gte('created_at', timeRangeStart)
  .limit(10 - agents.length)

// 4. Fill remaining slots with idle agents
// 5. Total always shows up to 10 agents
```

**Data Displayed Per Agent**:
1. **Agent ID**: Agent-01, Agent-02, etc. (auto-generated)
2. **Status Badge**: 
   - 🟢 **Active**: Currently processing an application
   - ⚪ **Idle**: Waiting for tasks or recently completed
3. **Current Task**: 
   - Active: "Processing: Company - Job Title (User Name)"
   - Idle: "Last: Company - Job Title" or "Waiting for tasks"

**What it means**:
- **Active Agents**: Number of applications being processed right now
- **Idle Agents**: Available capacity (no applications in queue)
- **Agent Count Badge**: Total agents shown (up to 10)

**Important Notes**:
- Agents are **virtual/derived**, not actual separate processes
- Each "agent" represents one application being processed
- Agent IDs are temporary and change with each refresh
- Time range filter affects which applications are considered

---

## 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        SUPABASE DATABASE                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  📊 live_application_queue                                   │
│     - All application records                                │
│     - Status: pending/processing/completed/failed            │
│     - Timestamps: created_at, started_at, completed_at       │
│     - User info: first_name, last_name, email                │
│     - Job info: company_name, job_title, job_url             │
│                                                              │
│  📈 portal_metrics                                           │
│     - Portal performance data                                │
│     - Logged after each application                          │
│     - Fields: portal_type, response_time_ms, status          │
│                                                              │
│  👥 users                                                    │
│     - User profiles                                          │
│     - Auto-updated via triggers                              │
│     - Fields: total_apps, successful_apps, failed_apps       │
│                                                              │
│  💼 jobs                                                     │
│     - Job listings                                           │
│     - Fields: title, company_name, right_swipes              │
│                                                              │
│  📝 application_logs                                         │
│     - Detailed logs per application                          │
│     - Used for debugging                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    ┌───────────────┐
                    │  API ENDPOINT │
                    │ /api/overview │
                    └───────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │  Query Parameters (Time Ranges):      │
        │  - chartRange: 1h/24h/7d/30d          │
        │  - companyRange: 24h/7d/30d           │
        │  - agentRange: 1h/24h/7d              │
        │  - jobRange: 24h/7d/30d               │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │  Data Processing & Aggregation:       │
        │  - Count applications by status        │
        │  - Group by time periods               │
        │  - Calculate success rates             │
        │  - Aggregate portal metrics            │
        │  - Join tables for complete data       │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │  JSON Response:                        │
        │  {                                     │
        │    stats: {...},                       │
        │    recentApps: [...],                  │
        │    applicationsChart: [...],           │
        │    topCompanies: [...],                │
        │    portalHealth: [...],                │
        │    userActivity: [...],                │
        │    jobInsights: [...],                 │
        │    agents: [...],                      │
        │    logs: [...]                         │
        │  }                                     │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │  React Component (Frontend):          │
        │  - Fetches every 5 seconds            │
        │  - Updates state with new data         │
        │  - Re-renders UI automatically         │
        │  - Handles time range filter changes   │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │  USER SEES:                            │
        │  - Real-time stats                     │
        │  - Live application stream             │
        │  - Dynamic charts                      │
        │  - Portal health status                │
        │  - User activity                       │
        │  - Job insights                        │
        │  - Agent status                        │
        └───────────────────────────────────────┘
```

---

## 📝 Summary Table

| Section | Real Data | Source | Updates | Empty State |
|---------|-----------|--------|---------|-------------|
| Total Applications | ✅ YES | live_application_queue | Every 5s | Shows 0 |
| Today | ✅ YES | live_application_queue | Every 5s | Shows 0 |
| Active Now | ✅ YES | live_application_queue | Every 5s | Shows 0 |
| Success Rate | ✅ YES | live_application_queue | Every 5s | Shows 0.0% |
| Failed (All) | ✅ YES | live_application_queue | Every 5s | Shows 0 |
| Failed (Today) | ✅ YES | live_application_queue | Every 5s | Shows 0 |
| Live Stream | ✅ YES | live_application_queue | Every 5s | Empty list |
| Applications Chart | ✅ YES | live_application_queue | Every 5s + filter | Empty chart |
| Top Companies | ✅ YES | live_application_queue | Every 5s + filter | Empty list |
| Portal Health | ✅ YES | portal_metrics | Every 5s | "No portal data" |
| User Activity | ✅ YES | users | Every 5s | "No user data" |
| Job Insights | ✅ YES | live_application_queue + jobs | Every 5s + filter | "No job data" |
| AI Agents | ✅ YES (derived) | live_application_queue | Every 5s + filter | Shows idle agents |

---

## 🚀 What Happens When You Run an Application

1. **Application Created** → `live_application_queue` table
   - Status: `pending`
   - Overview shows: Total +1, Today +1

2. **Application Starts** → Status changes to `processing`
   - Overview shows: Active Now +1
   - Agent Status: New active agent appears

3. **During Processing** → Portal metrics logged
   - `portal_metrics` table gets new row
   - Tracks: portal type, response time, status

4. **Application Completes** → Status changes to `completed`
   - Overview shows: Active Now -1, Success Rate updates
   - Portal Health: Updates avg response time
   - User Activity: User's successful_apps +1 (via trigger)
   - Job Insights: Job's success rate updates

5. **If Application Fails** → Status changes to `failed`
   - Overview shows: Failed (All) +1, Failed (Today) +1
   - Portal Health: Failure rate increases
   - User Activity: User's failed_apps +1 (via trigger)

---

## ⚠️ Important Notes

### Data That Requires Setup:

1. **Portal Health**: 
   - Requires applications to be processed
   - Metrics logged automatically during automation
   - Empty until first application runs

2. **User Activity**:
   - Requires `users` table to be populated
   - Users must be manually created or imported
   - Stats auto-update via triggers

3. **Job Insights**:
   - Requires jobs in `jobs` table
   - Right swipes must be tracked separately
   - Applications must reference valid job_id

### Automatic vs Manual:

**Automatic** (No action needed):
- All stats cards
- Live application stream
- Applications chart
- Top companies
- Portal health (after apps run)
- AI agent status

**Requires Setup**:
- User Activity → Create users in `users` table
- Job Insights → Create jobs in `jobs` table with right_swipes

---

## 🔧 Troubleshooting

**"No portal data available"**
- Run at least one application
- Portal metrics are logged during automation
- Check `portal_metrics` table has data

**"No user data available"**
- Create users in `users` table
- Trigger will auto-update stats when applications run
- Check `users` table exists and has RLS policies

**"No job data available"**
- Add jobs to `jobs` table
- Ensure `live_application_queue.job_id` references valid jobs
- Check time range filter

**Charts showing 0**
- Create applications in `live_application_queue`
- Check `created_at` timestamps are recent
- Verify time range filter matches your data

---

## 📊 Performance Considerations

- **5-second refresh**: Balances real-time updates with server load
- **Time range filters**: Reduce query size for better performance
- **Indexed fields**: `created_at`, `status`, `portal_type` for fast queries
- **Limit clauses**: Top 5/10 items prevent large data transfers
- **Aggregation**: Done on server-side for efficiency

---

This overview page provides a complete, real-time dashboard of your job application automation system with all data sourced from Supabase and updated every 5 seconds.
