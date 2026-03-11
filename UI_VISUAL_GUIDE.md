# 🎨 Visual UI Guide - Where to Find Everything

## 1️⃣ Adding a Company with ATS Integration

### Location: `/companies` page → Click "Add Company" button

```
┌─────────────────────────────────────────────────────────┐
│  Add New Company                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Company Name: [Stripe________________]                │
│  Website: [stripe.com_______________]                   │
│  Careers URL: [stripe.com/careers____]                  │
│                                                         │
│  ... (other fields) ...                                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⚡ ATS Integration (Optional)                    │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ If this company uses Greenhouse, Lever, or      │   │
│  │ Ashby, you can automatically sync jobs          │   │
│  │                                                  │   │
│  │ ATS Platform: [Greenhouse ▼]                    │   │
│  │ ATS Company ID: [stripe_____________]           │   │
│  │                                                  │   │
│  │ API URL: https://api.greenhouse.io/v1/boards/   │   │
│  │          stripe/jobs                            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│                    [Cancel]  [Add Company]              │
└─────────────────────────────────────────────────────────┘
```

**What to fill:**
- ATS Platform: Select "Greenhouse", "Lever", or "Ashby"
- ATS Company ID: Enter the company identifier (e.g., "stripe")

---

## 2️⃣ Syncing Jobs from ATS

### Location: `/companies` page → Click on a company → Click sync button

```
┌─────────────────────────────────────────────────────────┐
│  Stripe                                                 │
│  Technology - 1001-5000 employees                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  About                                                  │
│  Leading payment processing platform...                │
│                                                         │
│  Company Information                                    │
│  Website: stripe.com                                    │
│  Careers: stripe.com/careers                            │
│  Location: San Francisco, CA                            │
│                                                         │
│  Portal Configuration                                   │
│  Portal Type: Greenhouse                                │
│  Success Rate: 95%                                      │
│                                                         │
│  Jobs at Stripe                                         │
│  47 jobs                                                │
│  • Senior Software Engineer                             │
│  • Product Manager                                      │
│  • Data Scientist                                       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ [⚡ Sync from greenhouse]                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**What happens when you click:**
1. Button shows "Syncing..."
2. API fetches jobs from Greenhouse
3. Alert shows: "Added 47 new jobs from greenhouse"
4. Jobs appear in Jobs page

---

## 3️⃣ Bulk Syncing All ATS Companies

### Location: `/jobs` page → Top right buttons

```
┌─────────────────────────────────────────────────────────┐
│  Jobs                                    1,247 total    │
│  Manage all job listings                                │
│                                                         │
│  [⚡ Sync All ATS] [⚡ Sync Latest Jobs] [+ Add Job]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  🔍 Search jobs...                                      │
│                                                         │
│  ID    Company    Title              Apps    Status     │
│  ─────────────────────────────────────────────────────  │
│  #001  Stripe     Software Engineer   12     Active     │
│  #002  Stripe     Product Manager     8      Active     │
│  #003  Notion     Designer            5      Active     │
│  ...                                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Buttons:**
- **Sync All ATS** - Syncs all companies with ATS integration (NEW!)
- **Sync Latest Jobs** - Syncs all companies using scraper (existing)
- **Add Job** - Manually add a job (existing)

---

## 4️⃣ What You'll See After Syncing

### Success Message

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Success                                             │
├─────────────────────────────────────────────────────────┤
│  Added 47 new jobs from greenhouse                      │
│                                                         │
│  Total found: 52                                        │
│  Added: 47 (5 were duplicates)                          │
│                                                         │
│                           [OK]                          │
└─────────────────────────────────────────────────────────┘
```

### Jobs Page After Sync

```
┌─────────────────────────────────────────────────────────┐
│  Jobs                                    1,294 total    │
│                                          ↑ +47 new!     │
├─────────────────────────────────────────────────────────┤
│  #S-001  Stripe  Senior Software Engineer  Remote       │
│  #S-002  Stripe  Product Manager           SF           │
│  #S-003  Stripe  Data Scientist            Remote       │
│  #S-004  Stripe  Engineering Manager       Seattle      │
│  ... (43 more Stripe jobs)                              │
└─────────────────────────────────────────────────────────┘
```

---

## 5️⃣ Company Card with ATS Badge

### Location: `/companies` page → Company grid

```
┌─────────────────────────────────────────┐
│  [S]  Stripe                    ✅ Active│
│       Technology                         │
│                                          │
│  Jobs: 47    Today: 12    Success: 95%  │
│                                          │
│  Greenhouse • Avg: 2m 15s                │
│  ↑ ATS type shown here                   │
└─────────────────────────────────────────┘
```

---

## 6️⃣ Editing Existing Company to Add ATS

### Location: Click company → Click "Edit" button

```
┌─────────────────────────────────────────────────────────┐
│  Edit Company                                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Company Name: [Airbnb______________]                   │
│  Website: [airbnb.com___________]                       │
│                                                         │
│  ... (other fields) ...                                 │
│                                                         │
│  Portal Type: [Greenhouse ▼]                            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Add ATS Integration:                            │   │
│  │ ATS Type: [Greenhouse ▼]                        │   │
│  │ ATS Company ID: [airbnb_____________]           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│                    [Cancel]  [Save Changes]             │
└─────────────────────────────────────────────────────────┘
```

---

## 7️⃣ Bulk Sync Results

### After clicking "Sync All ATS"

```
┌─────────────────────────────────────────────────────────┐
│  ✅ Bulk Sync Complete                                  │
├─────────────────────────────────────────────────────────┤
│  Synced 10 companies, added 234 new jobs                │
│                                                         │
│  Details:                                               │
│  Stripe: 47 jobs                                        │
│  Airbnb: 52 jobs                                        │
│  Notion: 12 jobs                                        │
│  Linear: 8 jobs                                         │
│  Ramp: 23 jobs                                          │
│  Brex: 19 jobs                                          │
│  ... (4 more)                                           │
│                                                         │
│                           [OK]                          │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Quick Start Checklist

### Step 1: Database Setup
- [ ] Run SQL migration in Supabase
- [ ] Restart dev server

### Step 2: Add Test Company
- [ ] Go to Companies page
- [ ] Click "Add Company"
- [ ] Fill in: Name = "Stripe"
- [ ] Scroll to ATS Integration section
- [ ] Select: ATS Platform = "Greenhouse"
- [ ] Enter: ATS Company ID = "stripe"
- [ ] Click "Add Company"

### Step 3: Sync Jobs
- [ ] Click on Stripe company card
- [ ] Click "Sync from greenhouse" button
- [ ] Wait for success message
- [ ] Go to Jobs page
- [ ] See 40-60 Stripe jobs!

### Step 4: Add More Companies
- [ ] Add 5-10 more companies from reference list
- [ ] Go to Jobs page
- [ ] Click "Sync All ATS" button
- [ ] Get 200-500 jobs instantly!

---

## 📱 Mobile View

The UI is responsive and works on mobile:

```
┌─────────────────────┐
│ Companies    47     │
│ [+ Add Company]     │
├─────────────────────┤
│ 🔍 Search...        │
├─────────────────────┤
│ [S] Stripe          │
│     Technology      │
│     47 jobs • 95%   │
│     Greenhouse      │
├─────────────────────┤
│ [A] Airbnb          │
│     Travel          │
│     52 jobs • 92%   │
│     Greenhouse      │
└─────────────────────┘
```

---

## 🎨 Color Coding

- **Green badge** = Active ATS integration
- **Blue button** = Sync from ATS
- **Gray button** = Regular sync (scraper)
- **Primary color** = ATS Integration section

---

## 💡 Pro Tips

1. **Look for the ⚡ icon** - Indicates ATS features
2. **Check the Portal Type** - Shows which ATS is configured
3. **Use "Sync All ATS"** - Fastest way to get lots of jobs
4. **Watch the job count** - Updates in real-time after sync

---

## 🚀 You're Ready!

Everything is set up and ready to use. Just:
1. Run the SQL migration
2. Add a test company (Stripe)
3. Click sync
4. Watch the jobs appear!

**The UI is intuitive and self-explanatory. You'll see the ATS fields clearly marked in the company form.**
