-- Add user profile fields to live_application_queue table
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_headline TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_experience TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_gender TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_ethnicity TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_disability_status TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_resume_summary TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_work_experience JSONB;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_education JSONB;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_projects JSONB;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_skills TEXT[];
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_cover_letter TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_linkedin_url TEXT;
ALTER TABLE live_application_queue ADD COLUMN IF NOT EXISTS user_joined_at TEXT;

-- Insert mock data with full user profile
INSERT INTO live_application_queue (
  id, user_id, user_name, user_email, user_phone, user_location,
  company_id, company_name, job_title, job_id, status, agent_id,
  progress_step, total_steps, step_description, started_at, duration,
  created_at, screenshot,
  user_headline, user_experience, user_gender, user_ethnicity, user_disability_status,
  user_resume_summary, user_linkedin_url, user_joined_at,
  user_work_experience, user_education, user_projects, user_skills, user_cover_letter
) VALUES (
  'A-7824', 'u1', 'Aditya Surana', 'mail.adityasurana@gmail.com', '+91 7776004343', 'San Francisco, CA',
  'c2', 'Meta', 'Senior Software Engineer', 'M-045', 'failed', 'Agent-02',
  2, 5, 'Form validation error', '11:15:30', '3m 45s',
  '45s ago', NULL,
  'Senior Software Engineer', '8 years', 'Male', 'Asian', 'None',
  'Experienced Senior Software Engineer with 8+ years building scalable distributed systems. Expertise in full-stack development, cloud infrastructure, and system design. Proven track record at Stripe and Dropbox delivering high-availability services processing millions of transactions.',
  'linkedin.com/in/adityasurana', '2024-01-15',
  '[{"company":"Stripe","title":"Senior Software Engineer","startDate":"Jan 2021","endDate":"Present","yearsOfExperience":4,"description":"Led development of payment processing microservices handling 10M+ transactions/day."},{"company":"Dropbox","title":"Software Engineer","startDate":"Mar 2018","endDate":"Dec 2020","yearsOfExperience":3,"description":"Built real-time file sync infrastructure using Python and Go."},{"company":"Accenture","title":"Junior Developer","startDate":"Jun 2016","endDate":"Feb 2018","yearsOfExperience":2,"description":"Developed enterprise web applications for Fortune 500 clients."}]'::jsonb,
  '[{"university":"Stanford University","degree":"M.S.","course":"Computer Science","grade":"3.9/4.0","startDate":"Sep 2014","endDate":"Jun 2016"},{"university":"IIT Delhi","degree":"B.Tech","course":"Computer Science & Engineering","grade":"9.2/10","startDate":"Aug 2010","endDate":"May 2014"}]'::jsonb,
  '[{"title":"Distributed Task Scheduler","skills":["Go","Redis","Docker","Kubernetes"],"bullets":["Built a fault-tolerant distributed task scheduler supporting 50K concurrent jobs.","Implemented priority queues with dead-letter handling and automatic retries.","Reduced job processing latency by 40% compared to the previous Celery-based system.","Deployed on Kubernetes with auto-scaling based on queue depth metrics."]},{"title":"Real-Time Analytics Dashboard","skills":["React","TypeScript","WebSocket","D3.js"],"bullets":["Developed a real-time analytics dashboard processing 1M+ events per minute.","Built custom charting components using D3.js with sub-100ms render times.","Implemented WebSocket-based data streaming with automatic reconnection."]},{"title":"ML-Powered Code Review Bot","skills":["Python","TensorFlow","GitHub API"],"bullets":["Created an ML model that automatically reviews pull requests for common issues.","Trained on 500K+ code review comments from open-source projects.","Achieved 78% accuracy in identifying potential bugs before human review.","Integrated with GitHub Actions for seamless CI/CD pipeline integration."]}]'::jsonb,
  ARRAY['React','Python','AWS','Docker','TypeScript','Node.js','PostgreSQL','Redis','GraphQL','Kubernetes','CI/CD','System Design'],
  'Dear Hiring Manager, I am writing to express my strong interest in the Senior Software Engineer position. With 8 years of experience building scalable distributed systems at companies like Stripe and Dropbox, I am confident in my ability to contribute meaningfully to your engineering team. At Stripe, I led the development of payment processing microservices that handle over 10 million transactions daily, achieving 99.99% uptime. My expertise in React, Python, AWS, and Kubernetes allows me to deliver robust full-stack solutions. I am particularly excited about the opportunity to work on challenging technical problems and mentor junior engineers. I look forward to discussing how my experience aligns with your team''s goals. Best regards, Aditya Surana'
);


INSERT INTO live_application_queue (
  id, user_id, user_name, user_email, user_phone, user_location,
  company_id, company_name, job_title, job_id, status, agent_id,
  progress_step, total_steps, step_description, started_at, duration,
  created_at, screenshot,
  user_headline, user_experience, user_gender, user_ethnicity, user_disability_status,
  user_resume_summary, user_linkedin_url, user_joined_at,
  user_work_experience, user_education, user_projects, user_skills, user_cover_letter
) VALUES (
  'A-7825', 'u3', 'Priya Sharma', 'priya.sharma@email.com', '+91 9876543210', 'Bangalore, India',
  'c2', 'Meta', 'Product Manager', 'M-045', 'queued', NULL,
  0, 5, NULL, NULL, NULL,
  '15s ago', NULL,
  'Product Manager', '6 years', 'Female', 'Asian', 'None',
  'Experienced Product Manager with 6 years driving product strategy and growth at leading tech companies. Expertise in mobile apps, SaaS platforms, and data-driven decision making.',
  'linkedin.com/in/priyasharma', '2023-06-20',
  '[{"company":"Google","title":"Senior Product Manager","startDate":"Jul 2021","endDate":"Present","yearsOfExperience":3,"description":"Led product strategy for Google Cloud Platform resulting in 40% revenue growth."},{"company":"Flipkart","title":"Product Manager","startDate":"Jan 2019","endDate":"Jun 2021","yearsOfExperience":3,"description":"Managed mobile app features serving 50M+ users across India."}]'::jsonb,
  '[{"university":"IIT Bombay","degree":"B.Tech","course":"Computer Science","grade":"8.5/10","startDate":"Jul 2015","endDate":"May 2019"}]'::jsonb,
  '[{"title":"Mobile App Redesign","skills":["Figma","React Native","Analytics"],"bullets":["Redesigned mobile app increasing user engagement by 35%.","Implemented A/B testing framework for feature validation.","Reduced app load time by 50% through optimization."]},{"title":"Cloud Platform Growth","skills":["SQL","Tableau","Python"],"bullets":["Built analytics dashboard tracking 100+ KPIs.","Identified market opportunities leading to 3 new product lines."]}]'::jsonb,
  ARRAY['Product Strategy','Data Analytics','Figma','SQL','Python','React Native','Tableau','User Research'],
  'Dear Hiring Manager, I am excited to apply for the Product Manager position at Meta. With 6 years of experience building successful products at Google and Flipkart, I have a proven track record of driving growth and user satisfaction. My expertise in data-driven decision making and cross-functional leadership makes me an ideal fit for your team. I look forward to discussing how I can contribute to Meta''s product vision. Best regards, Priya Sharma'
);
