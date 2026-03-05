curl -X POST http://localhost:3000/api/scraper \
  -H "Content-Type: application/json" \
  -d '{"portalUrl":"https://careers.cred.club/openings","useFirecrawl":true}' 2>/dev/null | jq '.' | head -100
