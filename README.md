# FellowHire: Fellowship Management & Assessment Platform

A modern, multi-tenant platform for managing fellowship cohort admissions, candidate evaluations, automated logic/MCQ tests, and AI-powered screening interviews.

---

## 🚀 Overview & Key Features

- **Multi-Tenant Architecture:** Organizations can register, customize their workspace, invite team reviewers, and publish customized fellowship programs.
- **Public Program Pages & Applications:** Responsive public-facing job/fellowship pages with dynamic application forms and resume uploads.
- **Automated MCQ & Logic Assessments:** Timed candidate testing with randomized question sets, instant grading, and anti-cheating timers.
- **AI-Powered Screening Interviews:** Asynchronous video/audio candidate interviews evaluated automatically using Cloudflare Workers AI and speech recognition models.
- **Admin & Reviewer Dashboard:** Complete candidate pipeline tracking, sortable candidate scoreboards, assessment breakdowns, email invitations, and status workflows.
- **Superadmin Portal:** Platform-level controls to approve organizations and manage global settings.

---

## 🛠️ Tech Stack & Architecture

FellowHire is structured as a **Turborepo** monorepo:

```
fellowship-management-system/
├── apps/
│   ├── backend/          # Go (Golang) REST API
│   └── frontend/         # React + TypeScript SPA (Vite)
├── docker-compose.yml    # Local PostgreSQL & Redis infrastructure
├── Makefile              # Unified project development workflows
├── package.json          # Root npm workspace configuration
└── turbo.json            # Turborepo task pipeline
```

### Backend (`apps/backend`)
- **Language:** Go 1.25
- **HTTP Router:** [Chi v5](https://github.com/go-chi/chi) with rate-limiting, CORS, and request tracking
- **Database & Cache:** PostgreSQL 16 (via [`pgx/v5`](https://github.com/jackc/pgx)), Redis 7
- **Database Migrations:** [Goose](https://github.com/pressly/goose)
- **AI & Speech:** Cloudflare Workers AI (Whisper for audio transcription & LLM evaluation)
- **Storage:** Cloudflare R2 / Local disk storage fallback
- **Email:** AWS SES
- **Authentication:** JWT (HTTP-only cookies) & Google OAuth 2.0

### Frontend (`apps/frontend`)
- **Framework:** React 18 (`^18.3.1`) + TypeScript 5.6 + Vite 5.4
- **State & Data Fetching:** TanStack React Query v5 & Zustand
- **Styling:** Tailwind CSS 3.4 & Lucide React icons
- **Routing:** React Router v6
- **Analytics:** Firebase & Google Analytics

---

## 📋 Prerequisites

Before running the project locally, ensure you have:
- **Node.js:** `>= 20.x` and `npm >= 10.x`
- **Go:** `>= 1.25`
- **Docker & Docker Compose** (for PostgreSQL and Redis)
- **Make**

---

## 🏃‍♂️ Quick Start

### 1. First-Time Setup
Clone the repository and run the setup command to generate environment files and install dependencies:

```bash
make setup
```

This will:
- Copy `apps/backend/.env.example` to `apps/backend/.env`
- Copy `apps/frontend/.env.example` to `apps/frontend/.env`
- Install all npm workspace dependencies

### 2. Start Infrastructure
Start the local PostgreSQL 16 and Redis 7 containers:

```bash
make infra-up
```

### 3. Seed Database
Run database auto-migrations and seed initial development data:

```bash
make seed
```

This initializes:
- Default organization: **Acme Academy** (`slug: acme`)
- Default admin credentials:
  - **Email:** `admin@acme.org`
  - **Password:** `admin123`
- Default tracks, question banks, and assessment programs

### 4. Start Development Servers
Start both the backend API and frontend dev server concurrently:

```bash
make dev
```

- **Frontend:** [http://localhost:5173](http://localhost:5173)
- **Backend API:** [http://localhost:8080](http://localhost:8080)
- **API Health Check:** [http://localhost:8080/healthz](http://localhost:8080/healthz)

---

## ⚙️ Available Makefile Commands

| Command | Description |
|---|---|
| `make setup` | Copy default `.env` files and install npm dependencies |
| `make infra-up` | Start PostgreSQL and Redis containers in the background |
| `make infra-down` | Stop and tear down infrastructure containers |
| `make dev` | Start infrastructure, backend (`:8080`), and frontend (`:5173`) |
| `make dev-backend` | Run the Go backend API independently (`go run ./cmd/api`) |
| `make dev-frontend` | Run the Vite frontend server independently |
| `make build` | Build both backend binary (`bin/api`) and frontend bundle (`dist`) |
| `make test` | Run tests for both backend (`go test`) and frontend (`vitest`) |
| `make lint` | Run Go `vet` and frontend TypeScript typechecks |
| `make seed` | Execute the database seeder (`go run ./cmd/seed`) |
| `make migrate-up` | Apply pending database migrations with Goose |
| `make migrate-down` | Rollback the latest database migration |
| `make clean` | Clean build artifacts and Turbo cache |

---

## 🔑 Default Development Credentials

For local testing and administration:

| Role | Email | Password |
|---|---|---|
| **Organization Admin** | `admin@acme.org` | `admin123` |

Access the admin login page at: [http://localhost:5173/admin/login](http://localhost:5173/admin/login).

---

## 🌐 Environment Variables

### Backend (`apps/backend/.env`)
- `HTTP_PORT`: Port for the Go server (default: `8080`)
- `DATABASE_URL`: PostgreSQL connection string (default: `postgres://fms_user:fms_dev_password@localhost:5432/fms_dev?sslmode=disable`)
- `JWT_SECRET`: Secret key for signing JWT tokens
- `CORS_ALLOWED_ORIGINS`: Allowed client URLs (default: `http://localhost:5173,http://localhost:3000`)
- `STORAGE_PROVIDER`: File upload backend (`local` or `r2`)
- `CLOUDFLARE_ACCOUNT_ID` & `CLOUDFLARE_API_KEY`: Cloudflare credentials for AI video/audio screening
- `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`: Optional Google OAuth 2.0 credentials

### Frontend (`apps/frontend/.env`)
- `VITE_API_BASE_URL`: Base URL for API calls (default: `/api/v1`)
- `VITE_FIREBASE_*`: Optional Firebase Analytics credentials

---

## 📄 License

Internal proprietary software. All rights reserved.
