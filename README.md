# Estimation Platform

Full-stack software effort estimation tool — React + Node.js + PostgreSQL.

---

## Quick Start

```bash
# Backend
cd backend && npm run dev        # http://localhost:4000

# Frontend
cd frontend && npm run dev       # http://localhost:5173
```

> `startup.bat` starts the frontend on port **3000** instead (`npm run dev -- --port 3000`). Use whichever
> port matches how you started it; the links below assume `npm run dev` (5173).

---

## Organisational Hierarchy

Department → Program → Baseline → Component (optional) → Subcomponent (optional) → Task, shared by
Storypoint and Parametric Estimation. See [docs/HIERARCHY.md](docs/HIERARCHY.md) for the schema,
migration strategy, access model, API and tests.

Parametric Estimation tracks Estimated vs Actual PersonDays per task (record, correct, accuracy /
variance / deviation, dashboards). See [docs/PARAMETRIC_ACTUALS.md](docs/PARAMETRIC_ACTUALS.md).

The Estimation Activity graph on Dashboard SP and Dashboard PE has a From / To date filter (default: last
30 days). See [docs/DASHBOARD_ACTIVITY.md](docs/DASHBOARD_ACTIVITY.md).

Users are granted Story Point Estimation, Parametric Estimation, or both, independently of their role;
navigation, pages and APIs follow it. See [docs/MODULE_ACCESS.md](docs/MODULE_ACCESS.md).

The Estimation Performance dashboard (Overview → Estimation Performance) reports EFA, ED, EBI and EEI from
Historical Data SP and PE on a PersonDay basis. See [docs/ESTIMATION_PERFORMANCE.md](docs/ESTIMATION_PERFORMANCE.md).

---

## Monitoring & Developer Tools

| Tool | URL | Description |
|------|-----|-------------|
| **Swagger / API Docs** | [`http://localhost:4000/api-docs`](http://localhost:4000/api-docs) | Interactive OpenAPI 3.0 documentation — try any endpoint directly in the browser |
| **Raw OpenAPI JSON** | [`http://localhost:4000/api-docs.json`](http://localhost:4000/api-docs.json) | Machine-readable spec for import into Postman, Insomnia, etc. |
| **Health Dashboard** | [`http://localhost:5173/monitoring`](http://localhost:5173/monitoring) | Real-time service health — DB, memory, system, log storage |
| **Log Monitor** | [`http://localhost:5173/logs`](http://localhost:5173/logs) | Live log viewer — search, filter by level/category, trace by correlation ID |

### Backend Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Simple liveness — always 200 if process is up |
| `GET /api/monitoring/health` | Full health report (DB, memory, CPU, logs) — returns 503 if unhealthy |
| `GET /api/monitoring/health/live` | Liveness probe for container orchestrators |
| `GET /api/monitoring/health/ready` | Readiness probe — 503 if database unreachable |

### Log API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/monitoring/logs` | Query logs with filters: `level`, `category`, `search`, `from`, `to`, `correlationId`, `limit`, `offset` |
| `GET /api/monitoring/logs/stats` | 24h stats: by level, by category, recent errors, hourly trend |
| `DELETE /api/monitoring/logs?days=7` | Delete logs older than N days |

---

## Application Routes

| Path | Page |
|------|------|
| `/` | Dashboard |
| `/estimation-performance` | Estimation Performance (EFA / ED / EBI / EEI) |
| `/departments` | Department management |
| `/programs` | Program management (formerly Projects; `/projects` redirects) |
| `/baselines` | Baselines, Components & Subcomponents |
| `/estimate` | New Estimation Wizard |
| `/history` | Historical Data |
| `/analysis` | Analytics |
| `/master/story-points` | Story Points Master Data |
| `/master/effort` | Effort Estimates Master Data |
| `/master/competency` | Competency Master Data |
| `/logs` | Log Monitor |
| `/monitoring` | Health Monitor |
| `/no-module-access` | Shown when no estimation module is assigned |
| `/docs` | Documentation |
| `/settings` | Settings |

---

## Log Levels & Categories

**Levels** (lowest → highest severity): `debug` · `http` · `info` · `warn` · `error`

**Categories**: `api` · `database` · `auth` · `system` · `job` · `general`

Log files are written to `backend/logs/` with daily rotation (7-day combined, 14-day error).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL |
| Logging | Winston + daily-rotate-file + PostgreSQL sink |
| API Docs | Swagger UI (OpenAPI 3.0) |
| State | Zustand |
| Data Fetching | TanStack React Query |
