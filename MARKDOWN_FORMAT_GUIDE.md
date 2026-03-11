# Markdown Format for Cross-Platform Compatibility

## Overview

The system now stores job descriptions in **Markdown format** instead of HTML. This ensures perfect compatibility with both web and React Native mobile apps.

---

## Why Markdown?

✅ **Cross-Platform**: Works on web and React Native  
✅ **Clean**: No HTML tags visible in mobile apps  
✅ **Formatted**: Preserves headings, lists, bold, italic, links  
✅ **Simple**: Easy to render with libraries  

---

## Database Schema

### Field: `detailed_requirements`

- **Type**: TEXT
- **Format**: Markdown
- **Purpose**: Store formatted job descriptions

**Migration File**: `scripts/033_markdown_format.sql`

---

## How It Works

### 1. Data Fetching (Backend)

When jobs are fetched from Greenhouse API or scraped:

**File**: `/app/api/ats-sync/route.ts`
```typescript
import { htmlToMarkdown } from "@/lib/html-converter"

// Convert HTML to Markdown
detailedRequirements = htmlToMarkdown(sanitizedHtml)
```

**File**: `/app/api/scraper/route.ts`
```typescript
import { htmlToMarkdown } from "@/lib/html-converter"

// Convert HTML to Markdown
const markdownDetailedReqs = htmlToMarkdown(htmlDetailedReqs)
```

### 2. HTML to Markdown Conversion

**File**: `/lib/html-converter.ts`

The converter transforms:
- `<h1>` → `# Heading`
- `<h2>` → `## Heading`
- `<strong>` → `**bold**`
- `<em>` → `*italic*`
- `<ul><li>` → `- bullet point`
- `<a href="url">` → `[text](url)`
- Removes all HTML tags
- Decodes HTML entities

**Example Conversion**:

**Input (HTML)**:
```html
<h2>About Company</h2>
<p>We are a <strong>leading</strong> tech company.</p>
<ul>
  <li>Innovative culture</li>
  <li>Great benefits</li>
</ul>
```

**Output (Markdown)**:
```markdown
## About Company

We are a **leading** tech company.

- Innovative culture
- Great benefits
```

---

## Web App Implementation

**File**: `/components/screens/jobs-screen.tsx`

```typescript
import ReactMarkdown from 'react-markdown'

<ReactMarkdown className="job-content">
  {selectedJob.detailedRequirements}
</ReactMarkdown>
```

**Styling**: Custom CSS in `/app/globals.css` with `.job-content` class

---

## React Native Mobile App Implementation

### Install Markdown Renderer

```bash
npm install react-native-markdown-display
```

### Usage in Mobile App

```typescript
import Markdown from 'react-native-markdown-display';
import { ScrollView, StyleSheet } from 'react-native';

function JobDetails({ job }) {
  return (
    <ScrollView style={styles.container}>
      <Markdown style={markdownStyles}>
        {job.detailed_requirements}
      </Markdown>
    </ScrollView>
  );
}

const markdownStyles = {
  heading1: {
    fontSize: 24,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  heading2: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 6,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  bullet_list: {
    marginVertical: 4,
  },
  bullet_list_icon: {
    marginRight: 8,
  },
  strong: {
    fontWeight: 'bold',
  },
  em: {
    fontStyle: 'italic',
  },
  link: {
    color: '#007AFF',
  },
};

const styles = StyleSheet.create({
  container: { 
    padding: 16,
    backgroundColor: '#fff',
  },
});
```

---

## API Response Structure

When your mobile app fetches job data from `/api/jobs`:

```json
{
  "id": "P-123",
  "title": "Senior Engineer",
  "description": "Brief summary...",
  "detailed_requirements": "## About\n\nFull **markdown** description...\n\n- Requirement 1\n- Requirement 2",
  "requirements": ["5+ years experience"],
  "skills": ["React", "Node.js"],
  "benefits": ["Health insurance"]
}
```

---

## Markdown Features Supported

### Headings
```markdown
# H1
## H2
### H3
```

### Text Formatting
```markdown
**bold text**
*italic text*
```

### Lists
```markdown
- Bullet point 1
- Bullet point 2

1. Numbered item
2. Numbered item
```

### Links
```markdown
[Link text](https://example.com)
```

### Code
```markdown
Inline `code`

```
Code block
```
```

### Blockquotes
```markdown
> This is a quote
```

### Horizontal Rule
```markdown
---
```

---

## Migration Steps

### 1. Run Database Migration

```sql
-- In Supabase SQL Editor:
COMMENT ON COLUMN jobs.detailed_requirements IS 'Job description in Markdown format (compatible with web and React Native)';
```

### 2. Re-sync Existing Jobs

1. Go to Jobs page in dashboard
2. Click "Sync All ATS" button
3. All jobs will be re-fetched with Markdown format

### 3. Update Mobile App

Install and use `react-native-markdown-display`:

```bash
npm install react-native-markdown-display
```

```typescript
import Markdown from 'react-native-markdown-display';

<Markdown>{job.detailed_requirements}</Markdown>
```

---

## Testing

### Test Web Display
1. Add a job from Greenhouse
2. View job details
3. Should see formatted content with headings, bullets, bold text

### Test Mobile Display
1. Fetch job from API: `GET /api/jobs`
2. Check `detailed_requirements` field
3. Should contain Markdown format (e.g., `## Heading`, `**bold**`, `- bullet`)
4. Render with `react-native-markdown-display`
5. Should display beautifully formatted content

---

## Example Markdown Output

```markdown
## About PhonePe Limited

Headquartered in India, its flagship product, the PhonePe digital payments app, was launched in Aug 2016. As of April 2025, PhonePe has over 60 Crore (600 Million) registered users.

### Culture

At PhonePe, we go the extra mile to make sure you can bring your **best self** to work, Everyday!

## Role

The role based in our HQ at Bengaluru is responsible for hiring (largely sales employees) in few verticals of merchant payments.

### Responsibilities

- Planning: Execute talent acquisition strategy
- Process Management: ensure the company recruitment process
- Drive referral/campus hiring where required
- Proactively seek market intelligence

### Capabilities & Requirements

- MBA / Post Graduate degree in HR with 5+ years' experience
- Exposure to **bulk hiring / sales hiring** is mandatory
- Experience sourcing from different channels

## Benefits

- **Insurance Benefits** - Medical Insurance, Critical Illness Insurance
- **Wellness Program** - Employee Assistance Program
- **Parental Support** - Maternity Benefit, Paternity Benefit
```

---

## Summary

✅ **Web App**: Uses `react-markdown` to render Markdown  
✅ **Mobile App**: Uses `react-native-markdown-display` to render Markdown  
✅ **Single Format**: One field (`detailed_requirements`) works everywhere  
✅ **No HTML Tags**: Clean Markdown format, no gibberish in mobile  
✅ **Automatic**: Conversion happens automatically when fetching jobs  

Your mobile app will now display perfectly formatted job descriptions! 🎉
