-- Insert "Complete Your Profile" email template
INSERT INTO email_templates (name, trigger_type, subject, html_body) VALUES
('Complete Your Profile', 'complete_profile', 'Your Profile is Almost There! 🚧',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .progress-bar { background: #e0e0e0; border-radius: 10px; height: 20px; margin: 15px 0; overflow: hidden; }
    .progress-fill { background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; border-radius: 10px; }
    .missing-fields { background: white; padding: 15px 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
    .missing-fields li { margin: 5px 0; color: #555; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>

      <p>We noticed your profile is only <strong>{{completion_percentage}}% complete</strong>. Recruiters are way more likely to reach out when they see a fully filled-out profile.</p>

      <div class="progress-bar">
        <div class="progress-fill" style="width: {{completion_percentage}}%;"></div>
      </div>

      <p>Here''s what''s missing:</p>
      <div class="missing-fields">
        <ul>
          {{missing_fields}}
        </ul>
      </div>

      <p>It only takes a few minutes to fill these in, and it can make a <strong>huge</strong> difference in your job search. Let''s get that profile to 100%! 💪</p>

      <a href="{{app_url}}" class="button">Complete Your Profile →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Cheers,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>');
