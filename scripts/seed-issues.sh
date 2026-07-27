#!/usr/bin/env bash

# Seed GitHub Issues for Fellowship Management System
REPO="kulkultech/fellowship-management-system"

echo "Checking gh CLI authentication..."
if ! gh auth status &>/dev/null; then
  echo "Error: gh CLI is not authenticated. Please run 'gh auth login' first."
  exit 1
fi

echo "Seeding onboarding issues to $REPO..."

# Issue 1: Toggle logic bug
gh issue create --repo "$REPO" \
  --title "Onboarding Challenge: Fix Task Tracker Toggle Bug (Ticket #1)" \
  --body "### Bug Description
When checking/toggling Step 3 (Configure Coding Agents) in the fellows' details panel checklist, the visual status in the checklist flips incorrectly in the database.

### Target Location
File: \`netlify/functions/lib/InMemoryFellowRepository.js\` (and \`NetlifyBlobFellowRepository.js\`)

### Task
Locate the toggle flipping logic under \`updateProgress\` and ensure the checked state is saved correctly without inverting it. You can run \`npm run test\` to verify your solution."

# Issue 2: Application validation
gh issue create --repo "$REPO" \
  --title "Onboarding Challenge: Add Form Field Validation (Ticket #2)" \
  --body "### Feature Request / Bug
The application form currently accepts empty fields, malformed emails (e.g. \`bademail.com\`), and GitHub usernames with spaces, which corrupts database indexing.

### Target Location
File: \`netlify/functions/lib/InMemoryFellowRepository.js\` (and \`NetlifyBlobFellowRepository.js\`)

### Task
Add validation checks under \`saveApplication\`. If the email does not contain \`@\`, or the GitHub username contains spaces, throw an error to reject the application. You can verify your solution with \`npm run test\`."

# Issue 3: Certificate generation crash
gh issue create --repo "$REPO" \
  --title "Onboarding Challenge: Fix Graduation Certificate Crash (Ticket #3)" \
  --body "### Bug Description
When clicking the 'Graduate Fellow' button for a candidate, the server crashes with a \`TypeError: Cannot read properties of undefined (reading 'toUpperCase')\` when trying to split the email address.

### Target Location
File: \`netlify/functions/lib/InMemoryFellowRepository.js\` (and \`NetlifyBlobFellowRepository.js\`)

### Task
Correct the email string split calculation under \`graduateFellow\` to parse standard email formats successfully without throwing an exception. Verify your solution with \`npm run test\`."

echo "Successfully seeded all 3 issues!"
