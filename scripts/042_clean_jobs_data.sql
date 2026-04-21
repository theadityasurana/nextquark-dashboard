-- ============================================================
-- JOBS DATA CLEANUP SCRIPT
-- Run in Supabase SQL Editor
-- Normalizes data so filtering works properly on cards
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Relax NOT NULL constraints on fields that should be nullable
--    (empty string is worse than NULL for filtering)
-- ============================================================
ALTER TABLE jobs ALTER COLUMN salary_range DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN experience DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN portal_url DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN job_url DROP NOT NULL;
ALTER TABLE jobs ALTER COLUMN description DROP NOT NULL;

-- ============================================================
-- 1. NULL out "Not Applicable" / junk values across all fields
-- ============================================================
UPDATE jobs SET salary_range = NULL WHERE
  salary_range ~* '(not\s*(specified|applicable|available|disclosed|provided)|n/?a|none|competitive|tbd|tba|unknown|\-|^$)'
  OR trim(salary_range) = '';

UPDATE jobs SET experience = NULL WHERE
  experience ~* '(not\s*(specified|applicable|available|required)|n/?a|none|unknown|tbd|\-|^$)'
  OR trim(experience) = '';

UPDATE jobs SET education_level = NULL WHERE
  education_level ~* '(not\s*(specified|applicable|available|required)|n/?a|none|unknown|tbd|\-|^$)'
  OR trim(education_level) = '';

UPDATE jobs SET work_authorization = NULL WHERE
  work_authorization ~* '(not\s*(specified|applicable|available|required)|n/?a|none|unknown|tbd|\-|^$)'
  OR trim(work_authorization) = '';

UPDATE jobs SET description = NULL WHERE
  description ~* '^(not\s*(specified|applicable|available)|n/?a|none)$'
  OR trim(description) = '';

UPDATE jobs SET detailed_requirements = NULL WHERE
  detailed_requirements ~* '^(not\s*(specified|applicable|available)|n/?a|none)$'
  OR trim(detailed_requirements) = '';

UPDATE jobs SET location = 'Remote' WHERE
  location ~* '(not\s*(specified|applicable)|n/?a|none|unknown|tbd|\-|^$)'
  OR trim(location) = '';

UPDATE jobs SET type = 'Full-time' WHERE
  type ~* '(not\s*(specified|applicable)|n/?a|none|unknown|tbd|\-|^$)'
  OR trim(type) = '';

-- NULL out empty/junk URLs
UPDATE jobs SET portal_url = NULL WHERE trim(portal_url) IN ('', '-', 'N/A', 'n/a', 'none', 'None');
UPDATE jobs SET job_url = NULL WHERE trim(job_url) IN ('', '-', 'N/A', 'n/a', 'none', 'None');
UPDATE jobs SET company_website = NULL WHERE trim(company_website) IN ('', '-', 'N/A', 'n/a', 'none', 'None');
UPDATE jobs SET company_linkedin = NULL WHERE trim(company_linkedin) IN ('', '-', 'N/A', 'n/a', 'none', 'None');

-- Clean empty JSONB arrays that contain junk
UPDATE jobs SET requirements = '[]'::jsonb WHERE
  requirements IS NULL OR requirements = 'null'::jsonb OR requirements::text = '[""]';
UPDATE jobs SET skills = '[]'::jsonb WHERE
  skills IS NULL OR skills = 'null'::jsonb OR skills::text = '[""]';
UPDATE jobs SET benefits = '[]'::jsonb WHERE
  benefits IS NULL OR benefits = 'null'::jsonb OR benefits::text = '[""]';

-- Remove "N/A", empty strings, "Not Applicable" entries from inside JSONB arrays
UPDATE jobs SET requirements = (
  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements_text(requirements) AS elem
  WHERE trim(elem) != '' AND elem !~* '^(n/?a|not\s*applicable|none|-)$'
) WHERE jsonb_array_length(requirements) > 0;

UPDATE jobs SET skills = (
  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements_text(skills) AS elem
  WHERE trim(elem) != '' AND elem !~* '^(n/?a|not\s*applicable|none|-)$'
) WHERE jsonb_array_length(skills) > 0;

UPDATE jobs SET benefits = (
  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements_text(benefits) AS elem
  WHERE trim(elem) != '' AND elem !~* '^(n/?a|not\s*applicable|none|-)$'
) WHERE jsonb_array_length(benefits) > 0;

-- ============================================================
-- 2. Normalize JOB TYPE to standard values
-- ============================================================
UPDATE jobs SET type = 'Full-time'  WHERE type ~* '(full[\s\-_]*time|ft|permanent)' AND type != 'Full-time';
UPDATE jobs SET type = 'Part-time'  WHERE type ~* '(part[\s\-_]*time|pt)' AND type != 'Part-time';
UPDATE jobs SET type = 'Contract'   WHERE type ~* '(contract|contractor|temp)' AND type NOT IN ('Full-time','Part-time','Contract');
UPDATE jobs SET type = 'Internship' WHERE type ~* '(intern)' AND type NOT IN ('Full-time','Part-time','Contract','Internship');
UPDATE jobs SET type = 'Freelance'  WHERE type ~* '(freelance|gig)' AND type NOT IN ('Full-time','Part-time','Contract','Internship','Freelance');

-- ============================================================
-- 3. Normalize EXPERIENCE LEVEL to standard values
-- ============================================================
UPDATE jobs SET experience = 'Entry Level (0-1 years)'       WHERE experience ~* '(entry|new\s*grad|fresh|graduate)' AND experience IS NOT NULL AND experience !~ '^\w+ Level \(';
UPDATE jobs SET experience = 'Junior (1-3 years)'            WHERE experience ~* '(1[\s\-]*3|junior|associate)' AND experience IS NOT NULL AND experience !~ '^\w+ \(';
UPDATE jobs SET experience = 'Mid-Level (3-5 years)'         WHERE experience ~* '(mid|3[\s\-]*5|intermediate)' AND experience IS NOT NULL AND experience !~ '^\w+[\s\-]Level \(';
UPDATE jobs SET experience = 'Senior (5-8 years)'            WHERE experience ~* '(senior|5[\s\-]*8|sr\.?)' AND experience IS NOT NULL AND experience !~ '^Senior \(';
UPDATE jobs SET experience = 'Lead (8+ years)'               WHERE experience ~* '(lead|staff|8\+|8[\s\-]*10)' AND experience IS NOT NULL AND experience !~ '^Lead \(';
UPDATE jobs SET experience = 'Principal/Staff (10+ years)'   WHERE experience ~* '(principal|10\+|director|distinguished)' AND experience IS NOT NULL AND experience !~ '^Principal';

-- ============================================================
-- 4. Normalize EDUCATION LEVEL to standard values
-- ============================================================
UPDATE jobs SET education_level = 'High School'        WHERE education_level ~* '(high\s*school|ged|diploma)' AND education_level != 'High School';
UPDATE jobs SET education_level = 'Associate Degree'   WHERE education_level ~* '(associate)' AND education_level != 'Associate Degree';
UPDATE jobs SET education_level = 'Bachelor''s Degree' WHERE education_level ~* '(bachelor|b\.?s\.?|b\.?a\.?|b\.?tech|undergraduate|4[\s\-]*year)' AND education_level != 'Bachelor''s Degree';
UPDATE jobs SET education_level = 'Master''s Degree'   WHERE education_level ~* '(master|m\.?s\.?|m\.?a\.?|m\.?tech|graduate\s*degree)' AND education_level != 'Master''s Degree';
UPDATE jobs SET education_level = 'PhD'                WHERE education_level ~* '(ph\.?d|doctorate|doctoral)' AND education_level != 'PhD';
UPDATE jobs SET education_level = 'MBA'                WHERE education_level ~* '(mba)' AND education_level != 'MBA';
UPDATE jobs SET education_level = 'Not Required'       WHERE education_level ~* '(not\s*required|no\s*degree|any)' AND education_level != 'Not Required';

-- ============================================================
-- 5. Normalize WORK AUTHORIZATION to standard values
-- ============================================================
UPDATE jobs SET work_authorization = 'Visa Sponsorship Available' WHERE work_authorization ~* '(visa\s*sponsor|sponsor.*visa|h1b\s*sponsor|will\s*sponsor)' AND work_authorization != 'Visa Sponsorship Available';
UPDATE jobs SET work_authorization = 'No Visa Sponsorship'       WHERE work_authorization ~* '(no\s*visa|no\s*sponsor|cannot\s*sponsor|won''t\s*sponsor)' AND work_authorization != 'No Visa Sponsorship';
UPDATE jobs SET work_authorization = 'US Citizen or Green Card Only' WHERE work_authorization ~* '(citizen|green\s*card|permanent\s*resident|clearance)' AND work_authorization != 'US Citizen or Green Card Only';
UPDATE jobs SET work_authorization = 'H1B Transfer Only'         WHERE work_authorization ~* '(h1b\s*transfer|transfer\s*only)' AND work_authorization != 'H1B Transfer Only';
UPDATE jobs SET work_authorization = 'Open to All'               WHERE work_authorization ~* '(open\s*to\s*all|any\s*authorization|all\s*welcome)' AND work_authorization != 'Open to All';

-- ============================================================
-- 6. Normalize LOCATION to "City, Country" format
-- ============================================================
UPDATE jobs SET location = trim(regexp_replace(location, '\s+', ' ', 'g'));
UPDATE jobs SET location = 'Remote' WHERE location ~* '^remote';
UPDATE jobs SET location = 'Hybrid' WHERE location ~* '^hybrid';

-- Create temp lookup: US state abbreviations & full names → "City, USA"
CREATE TEMP TABLE us_states (abbr TEXT, full_name TEXT) ON COMMIT DROP;
INSERT INTO us_states (abbr, full_name) VALUES
  ('AL','Alabama'),('AK','Alaska'),('AZ','Arizona'),('AR','Arkansas'),
  ('CA','California'),('CO','Colorado'),('CT','Connecticut'),('DE','Delaware'),
  ('FL','Florida'),('GA','Georgia'),('HI','Hawaii'),('ID','Idaho'),
  ('IL','Illinois'),('IN','Indiana'),('IA','Iowa'),('KS','Kansas'),
  ('KY','Kentucky'),('LA','Louisiana'),('ME','Maine'),('MD','Maryland'),
  ('MA','Massachusetts'),('MI','Michigan'),('MN','Minnesota'),('MS','Mississippi'),
  ('MO','Missouri'),('MT','Montana'),('NE','Nebraska'),('NV','Nevada'),
  ('NH','New Hampshire'),('NJ','New Jersey'),('NM','New Mexico'),('NY','New York'),
  ('NC','North Carolina'),('ND','North Dakota'),('OH','Ohio'),('OK','Oklahoma'),
  ('OR','Oregon'),('PA','Pennsylvania'),('RI','Rhode Island'),('SC','South Carolina'),
  ('SD','South Dakota'),('TN','Tennessee'),('TX','Texas'),('UT','Utah'),
  ('VT','Vermont'),('VA','Virginia'),('WA','Washington'),('WV','West Virginia'),
  ('WI','Wisconsin'),('WY','Wyoming'),('DC','District of Columbia');

-- Convert "City, ST" → "City, USA" (e.g. "San Francisco, CA" → "San Francisco, USA")
UPDATE jobs j SET location = split_part(j.location, ',', 1) || ', USA'
FROM us_states s
WHERE trim(split_part(j.location, ',', 2)) = s.abbr
  AND j.location NOT IN ('Remote', 'Hybrid')
  AND j.location LIKE '%,%';

-- Convert "City, Full State Name" → "City, USA" (e.g. "Austin, Texas" → "Austin, USA")
UPDATE jobs j SET location = split_part(j.location, ',', 1) || ', USA'
FROM us_states s
WHERE trim(split_part(j.location, ',', 2)) ~* ('^' || s.full_name || '$')
  AND j.location NOT IN ('Remote', 'Hybrid')
  AND j.location LIKE '%,%';

-- Convert "City, State, US/USA/United States" → "City, USA"
UPDATE jobs SET location = split_part(location, ',', 1) || ', USA'
WHERE trim(split_part(location, ',', 3)) ~* '^(us|usa|united\s*states)$'
  AND location NOT IN ('Remote', 'Hybrid');

-- Country name normalization for non-US locations
CREATE TEMP TABLE country_aliases (alias TEXT, canonical TEXT) ON COMMIT DROP;
INSERT INTO country_aliases (alias, canonical) VALUES
  ('UK', 'United Kingdom'), ('U.K.', 'United Kingdom'), ('England', 'United Kingdom'),
  ('Scotland', 'United Kingdom'), ('Wales', 'United Kingdom'),
  ('UAE', 'United Arab Emirates'), ('U.A.E.', 'United Arab Emirates'),
  ('South Korea', 'South Korea'), ('Republic of Korea', 'South Korea'),
  ('Deutschland', 'Germany'), ('Espana', 'Spain'), ('España', 'Spain'),
  ('Brasil', 'Brazil'), ('Nippon', 'Japan'),
  ('PRC', 'China'), ('ROC', 'Taiwan'),
  ('KSA', 'Saudi Arabia'), ('RSA', 'South Africa');

UPDATE jobs j SET location = split_part(j.location, ',', 1) || ', ' || ca.canonical
FROM country_aliases ca
WHERE trim(split_part(j.location, ',', 2)) ~* ('^' || ca.alias || '$')
  AND j.location NOT IN ('Remote', 'Hybrid')
  AND j.location LIKE '%,%';

-- Indian state/city normalization: "City, Karnataka" etc → "City, India"
CREATE TEMP TABLE indian_states (name TEXT) ON COMMIT DROP;
INSERT INTO indian_states (name) VALUES
  ('Karnataka'),('Maharashtra'),('Tamil Nadu'),('Telangana'),('Delhi'),
  ('Haryana'),('Uttar Pradesh'),('Gujarat'),('West Bengal'),('Rajasthan'),
  ('Kerala'),('Madhya Pradesh'),('Andhra Pradesh'),('Punjab'),('Jharkhand'),
  ('Odisha'),('Chhattisgarh'),('Assam'),('Bihar'),('Goa');

UPDATE jobs j SET location = split_part(j.location, ',', 1) || ', India'
FROM indian_states s
WHERE trim(split_part(j.location, ',', 2)) ~* ('^' || s.name || '$')
  AND j.location NOT IN ('Remote', 'Hybrid')
  AND j.location LIKE '%,%';

-- Fix "Bengaluru" → "Bangalore"
UPDATE jobs SET location = regexp_replace(location, 'Bengaluru', 'Bangalore', 'gi')
  WHERE location ~* 'bengaluru';
-- Fix "Gurugram" → "Gurgaon"
UPDATE jobs SET location = regexp_replace(location, 'Gurugram', 'Gurgaon', 'gi')
  WHERE location ~* 'gurugram';
-- Fix "NCR" / "Delhi NCR" → "Delhi, India"
UPDATE jobs SET location = 'Delhi, India'
  WHERE location ~* '(delhi\s*ncr|ncr|new\s*delhi)' AND location NOT LIKE '%, India';

-- Standalone city names without country → add country
UPDATE jobs SET location = location || ', Singapore' WHERE trim(location) ~* '^singapore$';
UPDATE jobs SET location = location || ', Hong Kong' WHERE trim(location) ~* '^hong\s*kong$';
UPDATE jobs SET location = 'London, United Kingdom' WHERE trim(location) ~* '^london$';
UPDATE jobs SET location = 'Berlin, Germany' WHERE trim(location) ~* '^berlin$';
UPDATE jobs SET location = 'Paris, France' WHERE trim(location) ~* '^paris$';
UPDATE jobs SET location = 'Tokyo, Japan' WHERE trim(location) ~* '^tokyo$';
UPDATE jobs SET location = 'Toronto, Canada' WHERE trim(location) ~* '^toronto$';
UPDATE jobs SET location = 'Vancouver, Canada' WHERE trim(location) ~* '^vancouver$';
UPDATE jobs SET location = 'Sydney, Australia' WHERE trim(location) ~* '^sydney$';
UPDATE jobs SET location = 'Melbourne, Australia' WHERE trim(location) ~* '^melbourne$';
UPDATE jobs SET location = 'Dubai, United Arab Emirates' WHERE trim(location) ~* '^dubai$';
UPDATE jobs SET location = 'Amsterdam, Netherlands' WHERE trim(location) ~* '^amsterdam$';
UPDATE jobs SET location = 'Dublin, Ireland' WHERE trim(location) ~* '^dublin$';
UPDATE jobs SET location = 'Bangalore, India' WHERE trim(location) ~* '^(bangalore|bengaluru)$';
UPDATE jobs SET location = 'Mumbai, India' WHERE trim(location) ~* '^mumbai$';
UPDATE jobs SET location = 'Hyderabad, India' WHERE trim(location) ~* '^hyderabad$';
UPDATE jobs SET location = 'Pune, India' WHERE trim(location) ~* '^pune$';
UPDATE jobs SET location = 'Chennai, India' WHERE trim(location) ~* '^chennai$';
UPDATE jobs SET location = 'Gurgaon, India' WHERE trim(location) ~* '^(gurgaon|gurugram)$';
UPDATE jobs SET location = 'Noida, India' WHERE trim(location) ~* '^noida$';
UPDATE jobs SET location = 'Kolkata, India' WHERE trim(location) ~* '^(kolkata|calcutta)$';

-- ============================================================
-- 7. Trim whitespace from all text fields
-- ============================================================
UPDATE jobs SET
  title = trim(title),
  company_name = trim(company_name),
  description = trim(description),
  detailed_requirements = trim(detailed_requirements),
  salary_range = trim(salary_range),
  portal_url = trim(portal_url),
  job_url = trim(job_url),
  company_website = trim(company_website),
  company_linkedin = trim(company_linkedin);

-- ============================================================
-- 8. Audit: Show what the data looks like now
-- ============================================================
SELECT 'Job Types' AS category, type AS value, count(*) AS cnt FROM jobs GROUP BY type ORDER BY cnt DESC;
SELECT 'Experience Levels' AS category, experience AS value, count(*) AS cnt FROM jobs GROUP BY experience ORDER BY cnt DESC;
SELECT 'Education Levels' AS category, education_level AS value, count(*) AS cnt FROM jobs GROUP BY education_level ORDER BY cnt DESC;
SELECT 'Work Auth' AS category, work_authorization AS value, count(*) AS cnt FROM jobs GROUP BY work_authorization ORDER BY cnt DESC;
SELECT 'Locations (top 20)' AS category, location AS value, count(*) AS cnt FROM jobs GROUP BY location ORDER BY cnt DESC LIMIT 20;
SELECT 'Null salary_range' AS category, count(*) AS cnt FROM jobs WHERE salary_range IS NULL;
SELECT 'Null experience' AS category, count(*) AS cnt FROM jobs WHERE experience IS NULL;

COMMIT;
