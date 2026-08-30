# FellowHire: Fellowship Management & Assessment Platform

Welcome to **FellowHire**! This application serves as a comprehensive multi-tenant platform to manage fellowship cohorts: publishing public job posts, receiving candidate applications, running automated timed logic tests and AI screening evaluations, and managing candidate pipelines.

---

## 🛠️ Tech Stack & Architecture

*   **Frontend:** React 19 + TypeScript + Vite. Styled with modern design tokens, glassmorphism, and responsive layouts.
*   **Backend:** Go (Golang) REST API with PostgreSQL repository layer and in-memory fallbacks.
*   **Authentication:** Session cookies & Google OAuth 2.0.

---

## 🏃‍♂️ Setup & Commands

To work on FellowHire, use the following terminal commands:

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
