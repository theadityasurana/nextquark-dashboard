# Testing Meesho Jobs Scraper

## Option 1: Test via API (Recommended)

1. Start the development server:
   ```bash
   npm run dev
   ```

2. In another terminal, run the test script:
   ```bash
   node test-meesho.js
   ```

This will send a POST request to `/api/scraper` with the Meesho jobs URL and display the results.

## Option 2: Direct Puppeteer Test

Run the direct test script:
```bash
npx ts-node test-meesho-direct.ts
```

This bypasses the API and directly tests the Puppeteer scraper.

## Expected Output

The scraper should extract job listings from https://www.meesho.io/jobs and return:
- Job title
- Location
- Job type (Full-time, Part-time, etc.)
- Job URL
- Description
- Requirements, skills, and benefits (if available)

## Troubleshooting

- If Puppeteer fails to launch, ensure you have the required dependencies:
  ```bash
  npm install puppeteer
  ```

- If the scraper returns empty results, the page structure may have changed. Check the browser console for any JavaScript errors.

- For debugging, you can set `headless: false` in the scraper to see the browser in action.
