# Captcha Solving Setup

## Overview
The application now supports automatic captcha solving during job applications using browser-use SDK's built-in captcha solver.

## Setup Instructions

### 1. Choose a Captcha Solving Service
We support the following providers:
- **2Captcha** (Recommended) - https://2captcha.com
- **Anti-Captcha** - https://anti-captcha.com
- **CapSolver** - https://www.capsolver.com

### 2. Get API Key
1. Sign up for an account with your chosen provider
2. Add funds to your account (captcha solving is pay-per-solve)
3. Copy your API key from the dashboard

### 3. Configure Environment Variable
Add the following to your `.env.local` file:
```
CAPTCHA_SOLVER_API_KEY=your_api_key_here
```

### 4. Update Browser-Use Configuration (if needed)
The default provider is set to "2captcha". If you're using a different provider, update the `provider` field in `lib/browser-use.ts`:

```typescript
captchaSolver: {
  enabled: true,
  provider: "2captcha", // or "anticaptcha" or "capsolver"
  apiKey: process.env.CAPTCHA_SOLVER_API_KEY || "",
}
```

## How It Works
- When browser-use encounters a captcha during job application, it automatically sends it to the solving service
- The service solves the captcha and returns the solution
- Browser-use applies the solution and continues with the application
- No manual intervention required

## Pricing
Captcha solving services typically charge per captcha solved:
- reCAPTCHA v2: ~$2.99 per 1000 solves
- reCAPTCHA v3: ~$2.99 per 1000 solves
- hCaptcha: ~$2.99 per 1000 solves

## Troubleshooting
- If captchas are still not being solved, ensure your API key is valid and has sufficient balance
- Check the browser-use logs for captcha solving errors
- Verify the `CAPTCHA_SOLVER_API_KEY` environment variable is set correctly
