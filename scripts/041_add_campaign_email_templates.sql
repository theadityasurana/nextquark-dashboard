-- Insert selective email templates
INSERT INTO email_templates (name, trigger_type, subject, html_body) VALUES

('Inactivity Nudge', 'inactivity_nudge', 'We Miss You! 👋 Come Back to NextQuark',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .stats { background: white; padding: 15px 20px; border-radius: 8px; margin: 15px 0; text-align: center; border-left: 4px solid #667eea; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>

      <p>It''s been <strong>{{days_inactive}} days</strong> since we last saw you on NextQuark. A lot has changed since then!</p>

      <div class="stats">
        <p style="font-size: 24px; margin: 5px 0; color: #667eea;">🆕 New jobs added every day</p>
        <p style="color: #666; margin: 0;">Don''t miss out on opportunities that match your profile</p>
      </div>

      <p>Your profile is still active and ready to go. Just one swipe could land you your next big opportunity. 🚀</p>

      <a href="{{app_url}}" class="button">Start Swiping →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Cheers,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'),

('Milestone Celebration', 'milestone', '🎉 You Hit a Milestone on NextQuark!',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .milestone-badge { background: white; padding: 25px; border-radius: 12px; margin: 20px 0; text-align: center; border: 2px solid #667eea; }
    .milestone-number { font-size: 48px; font-weight: bold; color: #667eea; margin: 0; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 🙌</p>

      <div class="milestone-badge">
        <p class="milestone-number">{{app_count}}</p>
        <p style="margin: 5px 0; color: #666;">Applications submitted this month!</p>
      </div>

      <p>That''s incredible momentum! Every application brings you one step closer to landing your dream role. Keep the energy going! 💪</p>

      <p>Fun fact: Users who apply to 10+ jobs per month are <strong>3x more likely</strong> to get interview calls. You''re doing amazing!</p>

      <a href="{{app_url}}" class="button">Keep Applying →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Proud of you,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'),

-- Broadcast email templates

('Success Story', 'success_story', '🌟 {{headline}}',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .story-card { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>

      <div class="story-card">
        {{story_content}}
      </div>

      <p>This could be you next! Keep swiping, keep applying, and your moment will come. 🚀</p>

      <a href="{{app_url}}" class="button">Find Your Next Role →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Cheers,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'),

('Tips & Advice', 'tips_advice', '💡 {{headline}}',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .tip-card { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>

      <div class="tip-card">
        {{tip_content}}
      </div>

      <a href="{{app_url}}" class="button">Apply These Tips →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Happy job hunting,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'),

('New Feature Announcement', 'new_feature', '🚀 {{headline}}',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .feature-card { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>

      <div class="feature-card">
        {{feature_content}}
      </div>

      <a href="{{app_url}}" class="button">Try It Now →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Cheers,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>'),

('New Companies Added', 'new_companies', '🏢 {{headline}}',
'<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; }
    .banner { width: 100%; display: block; }
    .content { background: #f9f9f9; padding: 30px; }
    .companies-card { background: white; padding: 20px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #667eea; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
    .signature { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <img src="https://widujxpahzlpegzjjpqp.supabase.co/storage/v1/object/public/email-assets/email-banner.png" alt="NextQuark" class="banner" />
    <div class="content">
      <p>Hey {{first_name}}! 👋</p>

      <div class="companies-card">
        {{companies_content}}
      </div>

      <p>These companies are actively hiring. Don''t miss your chance! 🔥</p>

      <a href="{{app_url}}" class="button">Explore Jobs →</a>

      <div class="signature">
        <p style="margin-bottom: 5px;">Cheers,</p>
        <p style="margin: 0; font-weight: bold;">Aditya Surana</p>
        <p style="margin: 0; color: #666; font-size: 14px;">Founder, NextQuark</p>
      </div>
    </div>
  </div>
</body>
</html>');
