# Video Recording Feature

## Overview
The application now supports storing and viewing recorded videos of browser automation sessions. When an application is processed, the session is recorded and can be viewed later.

## Implementation Details

### Database Changes
- Added `recording_url` column to `live_application_queue` table
- Migration file: `scripts/025_add_recording_url.sql`

### How It Works

1. **Session Creation**: When a live stream starts, a browser-use session is created with a `liveUrl` for real-time viewing

2. **Recording Capture**: After the session completes, the system fetches the `recordingUrl` from the browser-use API

3. **Storage**: The recording URL is saved to the database in the `recording_url` field

4. **Viewing**: Users can view:
   - **Live Stream**: Real-time browser automation while it's running (shown with "● LIVE" badge)
   - **Recorded Video**: Playback of completed sessions (shown with "● SAVED" badge)

### UI Components

#### Queue Screen (`components/screens/queue-screen.tsx`)
- Captures `recordingUrl` from the completion event
- Updates database with recording URL
- Adds log entry when recording is saved

#### Application Details (`components/application-details.tsx`)
- Shows live stream viewer when session is active
- Shows recorded video viewer when recording is available
- Both use iframe embedding for seamless viewing

### API Changes

#### Browser-Use (`lib/browser-use.ts`)
- Fetches recording URL after session completes using `client.sessions.get(sessionId)`
- Returns `recordingUrl` in the response

#### Auto-Apply API (`app/api/auto-apply/route.ts`)
- Streams `recordingUrl` in completion event
- Passes recording URL to frontend

#### Live Queue API (`app/api/live-queue/route.ts`)
- PATCH endpoint now accepts `recording_url` parameter
- Updates database with recording URL

## Usage

### Running the Migration
```bash
# Connect to your Supabase database and run:
psql -h <your-db-host> -U postgres -d postgres -f scripts/025_add_recording_url.sql
```

Or use Supabase SQL Editor to run the migration.

### Viewing Recordings

1. Start a live application from the queue
2. Watch the live stream in real-time
3. After completion, the recording will be automatically saved
4. Click on the application card to view details
5. The recorded video will appear in the "Recorded Session" section

## Technical Notes

- Recording URLs are provided by the browser-use SDK
- Recordings are hosted by browser-use and accessible via iframe
- The recording persists even after the live session ends
- Both live and recorded videos use the same iframe embedding approach

## Future Enhancements

Potential improvements:
- Download recordings to local storage or S3
- Add recording duration and file size metadata
- Implement recording expiration/cleanup policies
- Add video playback controls (play, pause, speed)
- Generate thumbnails for quick preview
