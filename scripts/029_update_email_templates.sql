-- Update Welcome Email Template
UPDATE email_templates 
SET 
  subject = 'Welcome to NextQuark! 🚀',
  html_body = '<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to NextQuark! 🎉</h1>
      <p style="margin: 0; opacity: 0.9;">Your job search just got a major upgrade</p>
    </div>
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>
      
      <p>Congrats on making one of the smartest moves in your career journey! You just joined NextQuark – think of it as <strong>Tinder for jobs</strong>, but way cooler. 😎</p>
      
      <p>Here''s the vibe: swipe right on jobs you love, and boom – you''re applying. No more boring forms, no more endless scrolling. Just pure, effortless job hunting.</p>
      
      <p><strong>Pro tip:</strong> Head over to your profile section and complete all the details. Trust us, a complete profile = more interviews = more offers. It''s literally that simple. 💼✨</p>
      
      <p>You''re already ahead of the game by being here. Now let''s get you that dream job!</p>
      
      <a href="{{app_url}}" class="button">Complete Your Profile →</a>
      
      <div class="signature">
        <p style="margin-bottom: 5px;">Cheers,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'
WHERE trigger_type = 'welcome';

-- Update Application Submitted Email Template
UPDATE email_templates 
SET 
  subject = 'Application Submitted! 🎯',
  html_body = '<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .job-details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #11998e; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Submitted! ✅</h1>
      <p style="margin: 0; opacity: 0.9;">You''re one step closer to your next big move</p>
    </div>
    <div class="content">
      <p>Hey {{first_name}}! 🙌</p>
      
      <p>Your application just landed successfully! Here''s what you applied for:</p>
      
      <div class="job-details">
        <h3 style="margin-top: 0; color: #11998e;">{{job_title}}</h3>
        <p style="margin: 5px 0;"><strong>Company:</strong> {{company_name}}</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> {{location}}</p>
      </div>
      
      <p>Now it''s time to sit back and let the magic happen. ✨ The recruiter will check out your profile, and if they vibe with what they see, they''ll reach out to you directly.</p>
      
      <p>Keep your notifications on and stay tuned for updates. This could be the one! 🚀</p>
      
      <div class="signature">
        <p style="margin-bottom: 5px;">Best of luck,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'
WHERE trigger_type = 'application_submitted';
