# KulKul Fellowship Management System (Sandbox)

Welcome to the **KulKul Fellowship Management System** sandbox! This application serves as a dashboard to manage fellows: receiving new applications, tracking their progress through the 10-Step AI Challenge, and automatically issuing graduation certificates.

---

## 🛠️ Tech Stack & Architecture

*   **Frontend:** React 19 + Vite 8. Styled to match the Astro Starlight design theme in `src/index.css`.
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
*This command executes the repository tests. Your task is to resolve all failing tests until the test suite prints a successful green output.*
