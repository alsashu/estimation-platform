# Estimation Platform — Startup Guide

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 20 |
| PostgreSQL | ≥ 14 (or Docker) |
| npm | ≥ 10 |

---

## Option A: Docker (Recommended — all services in one command)

```bash
cd estimation-platform
docker-compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- PostgreSQL: localhost:5432

---

## Option B: Manual Local Setup

### 1. Start PostgreSQL

Make sure PostgreSQL is running and create the database:

```sql
CREATE USER estimation_user WITH PASSWORD 'estimation_pass';
CREATE DATABASE estimation_db OWNER estimation_user;
```

### 2. Backend

```bash
cd estimation-platform/backend
npm install
# Copy and edit environment variables
copy .env.example .env
# Start in development mode (schema + seed run automatically on first launch)
npm run dev
```

The backend will:
- Create all database tables on first start
- Seed all master data from EstimationModel.xlsx values automatically
- Run at http://localhost:4000

### 3. Frontend

```bash
cd estimation-platform/frontend
npm install
npm run dev
```

The frontend will:
- Run at http://localhost:3000
- PWA service worker registers automatically
- Theme preference persists in localStorage
- Offline mode activates automatically when network is unavailable

---

## First-Time Startup Behaviour

On the very first backend start, the system automatically:

1. Creates the PostgreSQL schema (all tables, triggers, indexes)
2. Seeds all master data:
   - 11 Story Point configurations (Complexity × Risk → SP + colour)
   - 9 Effort Estimate configurations (SP → Days range)
   - 15 Competency Overhead entries (3 competency × 5 complexity)
   - 3 Competency Level definitions
   - 5 Complexity Level definitions
   - 5 Risk Level definitions
   - 1 Welcome notification
3. Sets a `seeded` flag so the seed does not run again on subsequent restarts

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://estimation_user:estimation_pass@localhost:5432/estimation_db` | PostgreSQL connection string |
| `PORT` | `4000` | API server port |
| `NODE_ENV` | `development` | Environment |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/estimations/calculate?complexity=&risk=&competency=` | Live calculation preview |
| GET | `/api/estimations` | List all estimations (paginated, filterable) |
| POST | `/api/estimations` | Create new estimation |
| PATCH | `/api/estimations/:id/actuals` | Record actual hours |
| GET | `/api/analysis/summary` | Overall accuracy summary |
| GET | `/api/analysis/complexity` | Accuracy by complexity |
| GET | `/api/analysis/sp-bands` | Average effort per SP band |
| GET | `/api/analysis/scatter` | Scatter data (estimated vs actual) |
| GET | `/api/analysis/trend` | Daily estimation trend |
| GET | `/api/story-points` | List story point configs |
| PUT | `/api/story-points/:id` | Update story point config |
| GET | `/api/effort-estimates` | List effort estimate configs |
| PUT | `/api/effort-estimates/:id` | Update effort estimate |
| GET | `/api/competency-overheads` | List overhead matrix |
| PUT | `/api/competency-overheads/:id` | Update overhead % |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/read-all` | Mark all notifications read |
| GET | `/health` | Health check |

---

## PWA Offline Support

The application uses **Workbox** (via vite-plugin-pwa) to cache:

- All static assets (JS, CSS, HTML, fonts, icons) — **precached** on install
- API responses — **NetworkFirst** strategy with 10-second timeout fallback to cache

When offline:
- The app loads from cache
- Previously loaded data is served from the API cache
- An offline banner appears in the top bar
- A toast notification alerts the user

---

## Colour Palette Reference

| Colour | Hex | Usage |
|---|---|---|
| Carbon Blue | `#1E3246` | Primary buttons, sidebar, SP 100 |
| Vibrant Red | `#DC3223` | Error states, SP 20, danger |
| Gold | `#9B875F` | Accent, SP 5, warning |
| Green Line | `#19AA6E` | Success states, SP 1 |
| Steel Slate | `#4B5A69` | Secondary UI, SP 40 |
| Soft Red | `#E15A50` | SP 13, Emerging competency |
| Muted Gold | `#AFA082` | SP 8 |
| Soft Green | `#A6B98C` | SP 3 |
| Mint Green | `#73CDAA` | SP 2 |

### Story Point Colour Coding (from EstimationModel.xlsx)

| SP | Colour | Hex |
|---|---|---|
| 1 | Green Line | `#19AA6E` |
| 2 | Mint Green | `#73CDAA` |
| 3 | Soft Green | `#A6B98C` |
| 5 | Gold | `#9B875F` |
| 8 | Muted Gold | `#AFA082` |
| 13 | Soft Red | `#E15A50` |
| 20 | Vibrant Red | `#DC3223` |
| 40 | Steel Slate | `#4B5A69` |
| 100 | Carbon Blue | `#1E3246` |
