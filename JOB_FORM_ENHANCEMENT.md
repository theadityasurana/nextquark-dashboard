# Job Form Enhancement - Education Level & Work Authorization

## Summary
Added two new fields to the Add New Job form:
1. **Education Level** - Dropdown to select required education (Bachelor's, Master's, PhD, etc.)
2. **Work Authorization** - Dropdown for visa/relocation requirements (Visa Sponsorship, H1B, Relocation, etc.)

## Files Modified

### 1. `/lib/locations.ts` (NEW FILE)
Created constants file with dropdown options:
- `EDUCATION_QUALIFICATIONS` - Education level options
- `WORK_AUTHORIZATION` - Work authorization/visa options
- Also includes `LOCATIONS` and `WORK_MODES` for future use

### 2. `/components/screens/jobs-screen.tsx`
- Added `educationLevel` and `workAuthorization` to job form state
- Added two new dropdown fields in the Add Job dialog (after Detailed Requirements)
- Added fields to the Edit Job dialog
- Added display of these fields in the Job Detail view
- Updated form reset logic

### 3. `/app/api/jobs/route.ts`
- Added `education_level` and `work_authorization` to POST handler
- Added field mapping in PATCH handler for updates

### 4. `/lib/mock-data.ts`
- Updated `Job` type interface to include optional fields:
  - `educationLevel?: string`
  - `workAuthorization?: string`

### 5. `/lib/data-context.tsx`
- Updated `mapJob` function to map database fields to frontend fields

### 6. `/scripts/016_add_education_and_work_auth.sql` (NEW FILE)
SQL migration to add columns to Supabase

## Database Migration

Run this SQL in your Supabase SQL Editor:

```sql
-- Add education_level column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS education_level TEXT;

-- Add work_authorization column
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS work_authorization TEXT;

-- Add comments for documentation
COMMENT ON COLUMN jobs.education_level IS 'Required education level for the job (e.g., Bachelor''s Degree, Master''s Degree, PhD)';
COMMENT ON COLUMN jobs.work_authorization IS 'Work authorization/visa requirements (e.g., Visa Sponsorship Available, H1B Transfer Only, Relocation Provided)';
```

## Dropdown Options

### Education Level
- High School
- Associate Degree
- Bachelor's Degree
- Master's Degree
- PhD
- MBA
- Not Required

### Work Authorization
- No Visa Sponsorship
- Visa Sponsorship Available
- H1B Transfer Only
- Relocation Provided
- Relocation Not Provided
- US Citizen or Green Card Only
- Work Authorization Required
- Open to All

## Testing Steps

1. Run the SQL migration in Supabase SQL Editor
2. Launch the app: `npm run dev`
3. Navigate to Jobs section
4. Click "Add Job" button
5. Scroll down to see the two new fields after "Detailed Requirements"
6. Select options from both dropdowns
7. Save the job
8. View the job details to see the fields displayed
9. Edit the job to verify the fields are editable

## Notes
- Both fields are optional (not required)
- Fields display "Not specified" in detail view if not set
- Fields are fully integrated with create, read, and update operations
