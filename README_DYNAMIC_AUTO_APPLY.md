# Dynamic Auto-Apply System

## Overview

This implementation transforms the job application system from a hardcoded single-application demo into a fully dynamic, queue-based auto-apply system that processes all entries from the Supabase `live_application_queue` table.

## 🎯 What Changed

### Before
- Single hardcoded application (A-7821 for CRED)
- Mock user data (Aditya Surana)
- Manual "Start Live Stream" for one application
- No batch processing

### After
- ✅ Dynamic loading from Supabase
- ✅ Supports unlimited applications
- ✅ Individual and batch processing
- ✅ Real-time status tracking
- ✅ Comprehensive data support (certifications, achievements, diversity fields)
- ✅ Auto-refresh queue
- ✅ Full CRUD operations

## 📁 Files Modified/Created

### New Files
- `app/api/auto-apply-queue/route.ts` - New endpoint for queue-based auto-apply
- `DYNAMIC_AUTO_APPLY.md` - Implementation documentation
- `ARCHITECTURE.md` - System architecture diagrams
- `QUICK_START.md` - User guide
- `SCHEMA_REFERENCE.md` - Database schema documentation
- `test-auto-apply.sh` - Test script

### Modified Files
- `app/api/live-queue/route.ts` - Enhanced data transformation
- `components/screens/queue-screen.tsx` - Dynamic data loading, batch processing
- `components/status-badge.tsx` - Added 'pending' status
- `lib/browser-use.ts` - Extended to support additional fields
- `lib/portal-detector.ts` - Enhanced prompt building with optional fields

## 🚀 Quick Start

### 1. Prerequisites
```bash
# Ensure environment variables are set
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
BROWSER_USE_API_KEY=your_key
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Navigate to Queue
```
http://localhost:3000/queue
```

### 4. Process Applications
- **Single**: Click "Start Live Stream" on any application card
- **Batch**: Click "Start All" to process all pending applications

## 📊 Features

### Application Queue Management
- View all applications from Supabase
- Filter by status (All, Queued, Processing, Done, Failed)
- Search by name, company, or job title
- Auto-refresh every 5 seconds
- Delete applications

### Individual Processing
- Click any application to view full details
- See complete applicant profile
- Start live stream for real-time monitoring
- View logs and screenshots
- Track progress step-by-step

### Batch Processing
- Process multiple applications sequentially
- Automatic status updates
- Error handling per application
- Progress tracking

### Data Support
- ✅ Personal information (name, email, phone, location)
- ✅ Professional data (headline, bio, experience, education)
- ✅ Skills and certifications
- ✅ Achievements and awards
- ✅ Social profiles (LinkedIn, GitHub)
- ✅ Diversity fields (gender, ethnicity, veteran status, disability)
- ✅ Job preferences (salary, work mode, locations)
- ✅ Resume upload

## 🏗️ Architecture

```
Supabase (live_application_queue)
    ↓
API Layer (/api/live-queue, /api/auto-apply-queue)
    ↓
Browser Automation (browser-use.ts)
    ↓
Portal Detection & Form Filling
    ↓
Real-time Status Updates
    ↓
Frontend UI (queue-screen.tsx)
```

See `ARCHITECTURE.md` for detailed diagrams.

## 📖 Documentation

| Document | Description |
|----------|-------------|
| `DYNAMIC_AUTO_APPLY.md` | Implementation details and changes |
| `ARCHITECTURE.md` | System architecture and data flow |
| `QUICK_START.md` | User guide and troubleshooting |
| `SCHEMA_REFERENCE.md` | Database schema and field descriptions |

## 🧪 Testing

Run the test script to verify implementation:
```bash
./test-auto-apply.sh
```

Expected output:
```
✓ /api/live-queue exists
✓ /api/auto-apply-queue exists
✓ Queue screen uses new endpoint
✓ Batch processing implemented
✓ Status badge supports 'pending'
✓ Browser-use supports optional fields
✓ Documentation created
```

## 🔄 Data Flow

1. **User Action**: Click "Start Live Stream"
2. **API Call**: POST to `/api/auto-apply-queue` with `applicationId`
3. **Data Fetch**: Query Supabase for application data
4. **Status Update**: Set status to 'processing'
5. **Browser Automation**: Fill and submit application form
6. **Real-time Streaming**: Send progress updates via SSE
7. **Completion**: Update status to 'completed' or 'failed'
8. **UI Update**: Refresh queue display

## 🎨 UI Components

### Queue Screen
- **Application Cards**: Grid of all applications
- **Filters**: Status tabs and search
- **Batch Controls**: "Start All" button
- **Auto-refresh**: Live status updates

### Detail Modal
- **Applicant Profile**: Full biodata display
- **Work Experience**: Job history with descriptions
- **Education**: Academic background
- **Projects**: Portfolio items
- **Certifications**: Professional credentials
- **Achievements**: Awards and recognition
- **Documents**: Resume and cover letter preview
- **Live Stream**: Real-time logs and screenshots

## 🔧 API Endpoints

### GET /api/live-queue
Fetch all applications
```bash
curl http://localhost:3000/api/live-queue
```

### POST /api/auto-apply-queue
Process single application
```bash
curl -X POST http://localhost:3000/api/auto-apply-queue \
  -H "Content-Type: application/json" \
  -d '{"applicationId": "uuid", "stream": true}'
```

### DELETE /api/live-queue
Remove application
```bash
curl -X DELETE http://localhost:3000/api/live-queue \
  -H "Content-Type: application/json" \
  -d '{"id": "uuid"}'
```

## 🗄️ Database Schema

### Required Fields
- `id` (UUID)
- `user_id` (UUID)
- `first_name` (TEXT)
- `last_name` (TEXT)
- `job_url` (TEXT)
- `status` (TEXT)

### Optional Fields
- Personal: `phone`, `location`, `headline`, `bio`
- Job: `job_id`, `company_name`, `job_title`
- Documents: `resume_url`
- Social: `linkedin_url`, `github_url`
- Diversity: `gender`, `ethnicity`, `veteran_status`, `disability_status`
- Structured: `experience`, `education`, `certifications`, `achievements`, `skills`

See `SCHEMA_REFERENCE.md` for complete schema.

## 🎯 Supported Job Portals

- Greenhouse
- Lever
- Workday
- LinkedIn Easy Apply
- iCIMS
- Jobvite
- SmartRecruiters
- BambooHR
- Generic/Unknown portals (fallback mode)

## 🐛 Troubleshooting

### No Applications Showing
- Check Supabase connection
- Verify table has data
- Check browser console for errors

### Application Stuck in Processing
- Verify Browser Use API key
- Check job URL is valid
- Review backend logs

### Resume Upload Fails
- Ensure resume URL is accessible
- Check file format (PDF)
- Verify file size < 5MB

See `QUICK_START.md` for detailed troubleshooting.

## 📈 Performance

- **Auto-refresh**: Every 5 seconds
- **Batch Processing**: Sequential (one at a time)
- **Real-time Updates**: Server-Sent Events (SSE)
- **Status Tracking**: Immediate database updates

## 🔐 Security

- Row Level Security (RLS) enabled
- User can only access their own applications
- Service role for backend operations
- API key required for browser automation

## 🚦 Status Flow

```
pending → processing → completed
                    ↘ failed
```

## 📝 Example Usage

```typescript
// Fetch applications
const response = await fetch('/api/live-queue')
const applications = await response.json()

// Process application
const result = await fetch('/api/auto-apply-queue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    applicationId: 'uuid',
    stream: true 
  })
})

// Stream progress
const reader = result.body.getReader()
while (true) {
  const { done, value } = await reader.read()
  if (done) break
  // Handle progress update
}
```

## 🎓 Learning Resources

- [Browser Use SDK Documentation](https://docs.browser-use.com)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
- [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

## 🤝 Contributing

When adding new features:
1. Update relevant documentation
2. Add tests if applicable
3. Follow existing code patterns
4. Update schema if database changes

## 📄 License

Same as parent project.

---

**Built with ❤️ for automated job applications**
