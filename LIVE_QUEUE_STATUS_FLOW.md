# Live Queue Status Flow & Logs Implementation

## Overview
This document describes the implementation of the status flow for live application queue and persistent logs storage.

## Status Flow

### 1. Pending → Processing
- **Trigger**: User clicks "Start Live Stream" button
- **Action**: 
  - Status immediately updates to `processing`
  - Application card moves to "Processing" section
  - Initial log entry created

### 2. Processing → Completed
- **Trigger**: AI successfully completes the application
- **Action**:
  - Status updates to `completed` when stream sends `status: "completed"`
  - Application card moves to "Done" section
  - Completion log with step count added

### 3. Processing → Failed
- **Trigger**: Any of the following:
  - Stream fails to start (no reader available)
  - Stream ends without starting (no valid data received)
  - Error status received from stream
  - Exception thrown during streaming
- **Action**:
  - Status updates to `failed`
  - Application card moves to "Failed" section
  - Error log added with details

## Logs Storage

### Database Schema
Created new table `application_logs`:
```sql
CREATE TABLE application_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  agent_id TEXT NOT NULL,
  message TEXT NOT NULL,
  application_id TEXT REFERENCES live_application_queue(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Features
- **Persistent Storage**: All logs saved to database
- **Automatic Cleanup**: Logs deleted when application is deleted (CASCADE)
- **Fast Queries**: Indexed by application_id and timestamp
- **Real-time + Persistent**: Combines context logs (real-time) with database logs
- **Auto-refresh**: Logs refresh every 3 seconds in ApplicationDetails

### Log Levels
- `info`: Normal operation logs
- `warn`: Warning messages
- `error`: Error messages

## Files Modified

1. **scripts/024_create_logs_table.sql** (NEW)
   - Creates application_logs table
   - Adds indexes and RLS policies

2. **app/api/logs/route.ts**
   - Changed from in-memory storage to database
   - GET: Fetches logs from database (optionally filtered by applicationId)
   - POST: Saves logs to database

3. **app/api/live-queue/route.ts**
   - PATCH endpoint now supports updating both `live_url` and `status`

4. **components/screens/queue-screen.tsx**
   - Status updates to `processing` when "Start Live Stream" clicked
   - Status updates to `completed` on successful completion
   - Status updates to `failed` on any error
   - Tracks if stream has started to detect startup failures
   - Local state updates for immediate UI feedback

5. **components/application-details.tsx**
   - Removed "Current screenshot" button
   - Fetches logs from database on mount and every 3 seconds
   - Combines real-time context logs with database logs
   - Deduplicates and sorts logs by timestamp

## Migration Steps

To apply the changes:

1. Run the SQL migration:
   ```bash
   # Copy the contents of scripts/024_create_logs_table.sql
   # and run it in your Supabase SQL editor
   ```

2. Restart the development server:
   ```bash
   npm run dev
   ```

## Testing

1. **Pending → Processing**:
   - Open live queue page
   - Click on any pending application
   - Click "Start Live Stream"
   - Verify card moves to Processing section

2. **Processing → Completed**:
   - Wait for AI to complete application
   - Verify card moves to Done section
   - Check logs show completion message

3. **Processing → Failed**:
   - Test with invalid job URL or network error
   - Verify card moves to Failed section
   - Check logs show error details

4. **Logs Persistence**:
   - Start an application
   - Refresh the page
   - Open the same application
   - Verify logs are still visible

## Notes

- Logs are automatically saved to database via the logs context
- Each application's logs are isolated and can be viewed independently
- Logs persist even after page refresh
- Deleting an application also deletes its logs (CASCADE)
- Status transitions are immediate in the UI for better UX
