-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL, -- 'welcome', 'application_submitted'
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email Logs Table
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default templates
INSERT INTO email_templates (name, trigger_type, subject, html_body) VALUES
('Welcome Email', 'welcome', 'Welcome to HireSwipe! 🎉', 
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to HireSwipe!</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      <p>Thank you for signing up! We''re excited to have you on board.</p>
      <p>Your account has been successfully created and you can now start exploring opportunities.</p>
      <a href="{{app_url}}" class="button">Get Started</a>
      <p style="margin-top: 30px; color: #666; font-size: 14px;">If you have any questions, feel free to reach out to our support team.</p>
    </div>
  </div>
</body>
</html>'),

('Application Submitted', 'application_submitted', 'Your Application Has Been Submitted! ✅',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .job-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Submitted Successfully!</h1>
    </div>
    <div class="content">
      <p>Hi {{name}},</p>
      <p>Great news! Your application has been successfully submitted.</p>
      <div class="job-details">
        <h3>{{job_title}}</h3>
        <p><strong>Company:</strong> {{company_name}}</p>
        <p><strong>Location:</strong> {{location}}</p>
      </div>
      <p>We''ll keep you updated on the progress of your application.</p>
      <p style="margin-top: 30px; color: #666; font-size: 14px;">Good luck! 🍀</p>
    </div>
  </div>
</body>
</html>');

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role to access
CREATE POLICY "Service role can manage email_templates" ON email_templates FOR ALL USING (true);
CREATE POLICY "Service role can manage email_logs" ON email_logs FOR ALL USING (true);
