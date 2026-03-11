# Email Functionality Setup Guide

## Overview
Automated email system that sends:
- **Welcome emails** when users sign up (profiles table)
- **Application submitted emails** when applications are added to live_application_queue

## Setup Steps

### 1. Run Database Migration
Execute the SQL script to create email tables:
```bash
# In Supabase SQL Editor, run:
scripts/028_create_email_tables.sql
```

This creates:
- `email_templates` - Stores customizable email templates
- `email_logs` - Tracks all sent emails

### 2. Configure Gmail SMTP

#### Get Gmail App Password:
1. Go to your Google Account: https://myaccount.google.com/
2. Navigate to **Security** → **2-Step Verification** (enable if not already)
3. Scroll down to **App passwords**
4. Generate a new app password for "Mail"
5. Copy the 16-character password

#### Update .env.local:
```env
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Configure Supabase Webhooks

#### For Profile Creation (Welcome Email):
1. Go to Supabase Dashboard → Database → Webhooks
2. Click **Create a new hook**
3. Configure:
   - **Name**: Profile Created Webhook
   - **Table**: profiles
   - **Events**: INSERT
   - **Type**: HTTP Request
   - **Method**: POST
   - **URL**: `https://your-domain.com/api/webhooks/profile-created`
   - **HTTP Headers**: `Content-Type: application/json`

#### For Application Submission:
1. Create another webhook
2. Configure:
   - **Name**: Application Submitted Webhook
   - **Table**: live_application_queue
   - **Events**: INSERT
   - **Type**: HTTP Request
   - **Method**: POST
   - **URL**: `https://your-domain.com/api/webhooks/application-submitted`
   - **HTTP Headers**: `Content-Type: application/json`

**Note**: For local development, use ngrok or similar to expose localhost:
```bash
ngrok http 3000
# Use the ngrok URL: https://xxxx.ngrok.io/api/webhooks/...
```

### 4. Test the System

#### Test Welcome Email:
```sql
-- Insert a test profile
INSERT INTO profiles (email, full_name) 
VALUES ('test@example.com', 'Test User');
```

#### Test Application Email:
```sql
-- Insert a test application
INSERT INTO live_application_queue (email, full_name, job_title, company_name, location) 
VALUES ('test@example.com', 'Test User', 'Software Engineer', 'Tech Corp', 'San Francisco');
```

### 5. Access Email Manager
- Navigate to **Email Manager** in the sidebar
- **Templates Tab**: Edit email templates (subject, HTML body)
- **Logs Tab**: Monitor sent emails and failures
- **Settings Tab**: View SMTP configuration

## Email Template Variables

### Welcome Email:
- `{{name}}` - User's full name
- `{{app_url}}` - Application URL

### Application Submitted Email:
- `{{name}}` - User's full name
- `{{job_title}}` - Job title
- `{{company_name}}` - Company name
- `{{location}}` - Job location

## Troubleshooting

### Emails not sending:
1. Check Gmail credentials in .env.local
2. Verify App Password is correct (no spaces)
3. Check email_logs table for error messages
4. Ensure 2-Step Verification is enabled on Gmail

### Webhooks not triggering:
1. Verify webhook URL is accessible (use ngrok for local)
2. Check Supabase webhook logs
3. Ensure table has correct columns (email, full_name, etc.)

### Template not found:
1. Verify email_templates table has data
2. Check trigger_type matches ('welcome' or 'application_submitted')
3. Ensure is_active = true

## API Endpoints

- `POST /api/webhooks/profile-created` - Triggered by Supabase on profile insert
- `POST /api/webhooks/application-submitted` - Triggered by Supabase on queue insert
- `GET /api/email/templates` - Get all templates
- `PUT /api/email/templates` - Update template
- `GET /api/email/logs` - Get email logs

## Security Notes

- Never commit .env.local with real credentials
- Use App Passwords, not your actual Gmail password
- Consider rate limiting for production
- Gmail has a 500 emails/day limit for free accounts
- For production, consider SendGrid, AWS SES, or Resend
