#!/bin/bash
# Dry-run the pipeline against several postings, one per ATS.
P="d34ffc21-c230-4795-843d-a6f015b5c01c"
run() {
  echo; echo "################ $1"
  E2E_URL="$1" E2E_PROFILE="$P" E2E_ALLOW_NO_LLM=1 \
    npx vitest run --config scripts/e2e/vitest.e2e.config.ts scripts/e2e/apply.e2e.ts > "$2" 2>&1
  echo "exit=$? -> $2"
}
run "https://job-boards.greenhouse.io/gleanwork/jobs/4724189005" /tmp/gh.log
run "https://jobs.lever.co/paytm/4a97658f-ac6f-4a86-b483-ae50dd5c7a46" /tmp/lv.log
run "https://jobs.ashbyhq.com/openai/bf036b23-cd23-46d0-a02f-4b1483f4698a" /tmp/ah.log
