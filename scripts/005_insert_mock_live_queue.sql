-- Insert mock data into live_application_queue
INSERT INTO live_application_queue (
  applicant_name,
  company_name,
  applicant_email,
  role_title,
  job_url,
  phone,
  location,
  experience,
  education,
  skills,
  resume_pdf_path,
  status
) VALUES
(
  'John Smith',
  'Google',
  'john.smith@email.com',
  'Senior Software Engineer',
  'https://careers.google.com/jobs/results/senior-software-engineer-123',
  '+1-555-0123',
  'San Francisco, CA',
  '8+ years in full-stack development',
  '[{"degree": "B.S.", "course": "Computer Science", "university": "Stanford University", "startDate": "2012", "endDate": "2016"}]'::jsonb,
  ARRAY['React', 'TypeScript', 'Node.js', 'Python', 'AWS', 'Docker'],
  'https://storage.googleapis.com/hireswipe-bucket/resumes/john-smith-resume.pdf',
  'pending'
),
(
  'Sarah Johnson',
  'Microsoft',
  'sarah.johnson@email.com',
  'Product Manager',
  'https://careers.microsoft.com/jobs/product-manager-456',
  '+1-555-0456',
  'Seattle, WA',
  '5+ years in product management',
  '[{"degree": "MBA", "course": "Business Administration", "university": "Harvard Business School", "startDate": "2018", "endDate": "2020"}]'::jsonb,
  ARRAY['Product Strategy', 'Data Analysis', 'Agile', 'Leadership'],
  'https://storage.googleapis.com/hireswipe-bucket/resumes/sarah-johnson-resume.pdf',
  'completed'
),
(
  'Michael Chen',
  'Amazon',
  'michael.chen@email.com',
  'Data Scientist',
  'https://careers.amazon.com/jobs/data-scientist-789',
  '+1-555-0789',
  'Seattle, WA',
  '6+ years in machine learning',
  '[{"degree": "M.S.", "course": "Data Science", "university": "MIT", "startDate": "2016", "endDate": "2018"}]'::jsonb,
  ARRAY['Python', 'TensorFlow', 'SQL', 'Spark', 'Statistics'],
  'https://storage.googleapis.com/hireswipe-bucket/resumes/michael-chen-resume.pdf',
  'processing'
);
