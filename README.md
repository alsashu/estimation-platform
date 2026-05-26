# Estimation Platform

Full-stack software effort estimation tool — React + Node.js + PostgreSQL.

---

## Quick Start

```bash
# Backend
cd backend && npm run dev        # http://localhost:4000

# Frontend
cd frontend && npm run dev       # http://localhost:3000
```

---

## Monitoring & Developer Tools

| Tool | URL | Description |
|------|-----|-------------|
| **Swagger / API Docs** | [`http://localhost:4000/api-docs`](http://localhost:4000/api-docs) | Interactive OpenAPI 3.0 documentation — try any endpoint directly in the browser |
| **Raw OpenAPI JSON** | [`http://localhost:4000/api-docs.json`](http://localhost:4000/api-docs.json) | Machine-readable spec for import into Postman, Insomnia, etc. |
| **Health Dashboard** | [`http://localhost:3000/monitoring`](http://localhost:3000/monitoring) | Real-time service health — DB, memory, system, log storage |
| **Log Monitor** | [`http://localhost:3000/logs`](http://localhost:3000/logs) | Live log viewer — search, filter by level/category, trace by correlation ID |

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
| `/estimate` | New Estimation Wizard |
| `/history` | Historical Data |
| `/analysis` | Analytics |
| `/master/story-points` | Story Points Master Data |
| `/master/effort` | Effort Estimates Master Data |
| `/master/competency` | Competency Master Data |
| `/logs` | Log Monitor |
| `/monitoring` | Health Monitor |
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
