# Email System - Quick Start (5 Minutes)

## 1️⃣ Get Gmail App Password (2 min)
1. Visit: https://myaccount.google.com/apppasswords
2. Sign in to your Gmail account
3. Click "Generate" → Select "Mail" → Generate
4. Copy the 16-character password (format: xxxx-xxxx-xxxx-xxxx)

## 2️⃣ Update .env.local (30 sec)
```env
GMAIL_USER=founders.nextquark@gmail.com
GMAIL_APP_PASSWORD=paste-your-16-char-password-here
```

## 3️⃣ Run Database Migration (1 min)
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy/paste content from: `scripts/028_create_email_tables.sql`
4. Click "Run"

## 4️⃣ Test It (1 min)
```bash
npm run dev
```
1. Navigate to http://localhost:3000/emails
2. Click "Settings" tab
3. Enter your email
4. Click "Send Test"
5. Check your inbox ✅

## 5️⃣ Setup Webhooks (Production Only)
**Skip this for local testing**

Supabase Dashboard → Database → Webhooks:

**Webhook 1:**
- Table: `profiles`
- Event: INSERT
- URL: `https://your-domain.com/api/webhooks/profile-created`

**Webhook 2:**
- Table: `live_application_queue`
- Event: INSERT  
- URL: `https://your-domain.com/api/webhooks/application-submitted`

---

## ✅ Done!
Your email system is ready. Emails will be sent automatically when:
- New user signs up → Welcome email
- Application submitted → Confirmation email

## 📧 Manage Emails
Go to `/emails` in your app to:
- Edit email templates
- View sent email logs
- Test email configuration

## 🆘 Troubleshooting
**Email not sending?**
- Check GMAIL_USER and GMAIL_APP_PASSWORD in .env.local
- Verify 2-Step Verification is enabled on Gmail
- Check `/emails` → Logs tab for error messages

**Need help?**
Read: `EMAIL_SETUP_GUIDE.md` for detailed instructions
