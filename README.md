# KulKul Fellowship Management System (Sandbox)

Welcome to the **KulKul Fellowship Management System** sandbox! This application serves as a dashboard to manage fellows: receiving new applications, tracking their progress through the 10-Step AI Challenge, and automatically issuing graduation certificates.

---

## 🛠️ Tech Stack & Architecture

*   **Frontend:** React 19 + Vite 8. Styled using a custom glassmorphic design token system in `src/index.css`.
*   **Backend:** Netlify Functions v2 (running an ES Module serverless API router in `netlify/functions/api.js`).
*   **Database (Repository Pattern):**
    *   **Production (Netlify):** Implements **Netlify Blobs** (a serverless key-value store requiring zero database credentials).
    *   **Development / Local:** Falls back to an **In-Memory Repository** (`InMemoryFellowRepository.js`), seeded with a mock fellow.

---

## 🏃‍♂️ Setup & Commands

To work on this sandbox, use the following terminal commands:

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Local Server
```bash
npm run dev
```
*Your frontend will boot at `http://localhost:5173`. To serve the backend endpoints locally, Vite routes api requests via `/api/*` proxy configurations.*

### 3. Run the Test Suite
We use **Vitest** to run our test suite:
```bash
npm run test
```
*This command executes the repository tests. You will see 3 failures initially. Once you fix all 3 bugs, the test suite will print a successful green output.*

---

## 🐛 Seeded Bug Tickets (Holes to Solve)

To complete the onboarding challenge, you must resolve the following three issues:

### Ticket 1: Step-3 Progress Checklist Toggle Bug
*   **Symptom:** When clicking "Step 3: Configure Coding Agents" in the fellow details checklist panel, it toggles the visual checkbox state, but the server database flips the value incorrectly (it becomes checked when it should be unchecked, and vice versa).
*   **Target File:** `netlify/functions/lib/InMemoryFellowRepository.js` (and `NetlifyBlobFellowRepository.js`).
*   **Task:** Locate the toggle flip logic under `updateProgress` and fix the boolean assignment so that it saves the correct checked state.

### Ticket 2: Missing Form Fields Validation
*   **Symptom:** The application form allows submitting empty names, malformed emails (e.g. `bademail.com`), and GitHub usernames with spaces or invalid characters. Note that the email is optional on registration: if omitted, it defaults to the placeholder format `github_username@placeholder.kulkul.tech`.
*   **Target File:** `netlify/functions/lib/InMemoryFellowRepository.js` (and `NetlifyBlobFellowRepository.js`).
*   **Task:** Under `saveApplication`, add validation logic. If the email is provided but does not contain `@`, or the GitHub username contains spaces, throw an error to reject the application with a `400 Bad Request`. If the email is omitted, it should default to `github_username@placeholder.kulkul.tech`.

### Ticket 3: Graduation Certificate Generation TypeError
*   **Symptom:** When clicking the "Graduate Fellow" button for a candidate, the server crashes with a `TypeError: Cannot read properties of undefined (reading 'toUpperCase')` when trying to split the email address.
*   **Target File:** `netlify/functions/lib/InMemoryFellowRepository.js` (and `NetlifyBlobFellowRepository.js`).
*   **Task:** Under `graduateFellow`, locate the email string parsing logic. Correct the split/hashing calculation so that it parses standard email formats successfully without throwing an exception.
