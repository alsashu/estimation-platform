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


# Node.js + React Full Stack Dependencies Guide

This document explains each dependency used in the project, including:

- **What** the library is
- **Why** it is used
- **When** to use it
- **Example Use Cases**

---

# Backend Dependencies

## 1. bcryptjs

### What
A JavaScript library used for hashing passwords using the BCrypt algorithm.

### Why
Passwords should never be stored in plain text. BCrypt hashes passwords with a salt, making them difficult to reverse even if the database is compromised.

### When
- User Registration
- Login Authentication
- Password Reset
- Change Password

### Example

```javascript
const hash = await bcrypt.hash(password, 10);
const isValid = await bcrypt.compare(password, hash);
```

---

## 2. cors

### What
Express middleware that enables Cross-Origin Resource Sharing (CORS).

### Why
Browsers block requests between different origins for security reasons. CORS allows your frontend application to communicate with your backend.

### When
- React + Node.js
- Angular + Node.js
- Vue + Express
- Mobile Applications

### Example

```javascript
app.use(cors({
    origin: "http://localhost:5173"
}));
```

---

## 3. dotenv

### What
Loads environment variables from a `.env` file into `process.env`.

### Why
Keeps secrets such as database credentials and API keys outside the source code.

### When
Use in every project.

### Example

```env
PORT=5000
JWT_SECRET=mySecret
DB_PASSWORD=password123
```

```javascript
require("dotenv").config();
console.log(process.env.JWT_SECRET);
```

---

## 4. express

### What
A minimal and flexible web framework for Node.js.

### Why
Simplifies the creation of REST APIs and middleware.

### When
Every Node.js REST API.

### Example

```javascript
app.get("/users", getUsers);
app.post("/login", loginUser);
```

---

## 5. express-async-errors

### What
Automatically catches errors thrown inside async Express routes.

### Why
Eliminates repetitive try/catch blocks.

### When
Projects using async/await.

### Example

```javascript
app.get("/users", async (req, res) => {
    throw new Error("Something went wrong");
});
```

---

## 6. express-rate-limit

### What
Limits the number of requests a client can make.

### Why
Protects against:

- Brute-force attacks
- DDoS attacks
- API abuse

### When
- Login endpoints
- Public APIs
- Authentication APIs

### Example

```javascript
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

app.use(limiter);
```

---

## 7. helmet

### What
Adds secure HTTP headers.

### Why
Protects against common web vulnerabilities such as:

- Clickjacking
- XSS
- MIME sniffing

### When
Every production application.

### Example

```javascript
app.use(helmet());
```

---

## 8. jsonwebtoken

### What
Creates and verifies JWT tokens.

### Why
Provides stateless authentication.

### When
- Login
- Authorization
- API Security

### Example

```javascript
const token = jwt.sign(
    { id: user.id },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
);
```

---

## 9. morgan

### What
HTTP request logger middleware.

### Why
Logs incoming API requests for debugging and monitoring.

### When
Development and Production.

### Example

```javascript
app.use(morgan("dev"));
```

---

## 10. pg

### What
Official PostgreSQL client for Node.js.

### Why
Allows applications to connect to PostgreSQL databases.

### When
Every PostgreSQL application.

### Example

```javascript
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DB_URL
});
```

---

## 11. swagger-ui-express

### What
Hosts Swagger UI inside Express.

### Why
Provides interactive API documentation.

### When
REST APIs.

### Example

```javascript
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
```

---

## 12. uuid

### What
Generates universally unique identifiers (UUIDs).

### Why
Creates globally unique IDs.

### When

- Primary Keys
- File Names
- Public IDs
- Distributed Systems

### Example

```javascript
const id = uuidv4();
```

---

## 13. winston

### What
Logging framework for Node.js.

### Why

Supports

- Error logs
- Info logs
- Warning logs
- Multiple log destinations

### When
Production applications.

### Example

```javascript
logger.info("Application Started");
logger.error("Database Error");
```

---

## 14. winston-daily-rotate-file

### What
Automatically rotates log files every day.

### Why

Instead of one huge log file

```
app.log
```

It creates

```
2026-07-01.log
2026-07-02.log
2026-07-03.log
```

### When
Production logging.

---

## 15. zod

### What
TypeScript-first schema validation library.

### Why

- Request validation
- Response validation
- Type inference

### When

- APIs
- Forms
- Configuration validation

### Example

```typescript
const schema = z.object({
    email: z.string().email(),
    age: z.number()
});
```

---

# Frontend Dependencies

## 1. @tanstack/react-query

### What
Server-state management library.

### Why

Provides

- API caching
- Background updates
- Automatic retries
- Pagination
- Infinite scrolling

### When
Fetching data from APIs.

### Example

```typescript
const { data } = useQuery({
    queryKey: ["users"],
    queryFn: getUsers
});
```

---

## 2. @tanstack/react-table

### What
A headless table library.

### Why

Supports

- Sorting
- Filtering
- Pagination
- Grouping
- Row Selection

### When

- Admin Panels
- Reports
- Data Grids

---

## 3. axios

### What
Promise-based HTTP client.

### Why

Simplifies API communication.

Features

- Automatic JSON parsing
- Interceptors
- Request cancellation

### When

Calling REST APIs.

### Example

```typescript
const users = await axios.get("/api/users");
```

---

## 4. clsx

### What
Utility for conditionally joining CSS class names.

### Why

Makes dynamic styling cleaner.

### Example

```tsx
className={clsx(
    "btn",
    isActive && "btn-primary"
)}
```

---

## 5. date-fns

### What
Modern JavaScript date utility library.

### Why

Supports

- Formatting
- Date calculations
- Date comparison

### Example

```typescript
format(new Date(), "dd/MM/yyyy");
```

---

## 6. framer-motion

### What
Animation library for React.

### Why

Supports

- Fade
- Slide
- Drag
- Page transitions
- Scale animations

### When

Modern interactive UIs.

---

## 7. lucide-react

### What
Open-source SVG icon library.

### Why

Provides

- Lightweight icons
- Tree shaking
- Customizable SVG icons

### When

Navigation

Buttons

Dashboards

---

## 8. react

### What
Core React library.

### Why

Responsible for

- Components
- Hooks
- State
- Rendering

---

## 9. react-dom

### What
Connects React to the browser DOM.

### Example

```typescript
createRoot(document.getElementById("root")!).render(<App />);
```

---

## 10. react-hook-form

### What
High-performance form library.

### Why

Provides

- Validation
- Error handling
- Better performance
- Minimal re-rendering

### When

- Login
- Registration
- CRUD Forms

---

## 11. react-router-dom

### What
Routing library for React.

### Why

Enables navigation between pages.

### Example Routes

```
/
login
dashboard
users
projects
settings
```

---

## 12. recharts

### What
Charting library.

### Why

Supports

- Line Charts
- Pie Charts
- Area Charts
- Bar Charts
- Composed Charts

### When

Dashboards

Reports

Analytics

---

## 13. tailwind-merge

### What
Merges conflicting Tailwind CSS classes.

### Why

Instead of

```tsx
"p-2 p-4"
```

Returns

```tsx
"p-4"
```

Useful for reusable components.

---

## 14. xlsx

### What
Excel file processing library.

### Why

Supports

- Import Excel
- Export Excel
- Read Worksheets
- Generate Reports

### When

Admin systems

Reporting

Bulk import/export

---

## 15. zod

### What
Schema validation library.

### Why

Works perfectly with

- React Hook Form
- TypeScript

Provides

- Runtime validation
- Static types

---

## 16. zustand

### What
Lightweight global state management library.

### Why

Stores application-wide state.

Examples

- Logged-in User
- Theme
- Sidebar
- Notifications
- Shopping Cart

### Example

```typescript
const useStore = create((set) => ({
    theme: "light",
    setTheme: (theme) => set({ theme })
}));
```

---

# Overall Architecture

```
                React UI
                   │
        React Router + Zustand
                   │
     React Hook Form + Zod
                   │
      Axios / React Query
                   │
             Express API
                   │
 Helmet → CORS → Rate Limit
                   │
JWT Authentication (jsonwebtoken)
                   │
Password Verification (bcryptjs)
                   │
      Zod Request Validation
                   │
 PostgreSQL Database (pg)
                   │
Winston + Morgan Logging
                   │
Swagger API Documentation
```

---

# Typical Request Flow

```
User
 │
 ▼
React Form
 │
React Hook Form + Zod
 │
Axios / React Query
 │
Express API
 │
Helmet
 │
CORS
 │
Rate Limiter
 │
JWT Authentication
 │
Request Validation (Zod)
 │
Business Logic
 │
PostgreSQL
 │
Logging (Winston)
 │
Response
 │
React Query Cache
 │
UI Updated
```

---

# Summary

| Category | Libraries |
|-----------|-----------|
| Backend Framework | Express |
| Authentication | bcryptjs, jsonwebtoken |
| Security | helmet, cors, express-rate-limit |
| Validation | zod |
| Database | pg |
| Logging | morgan, winston, winston-daily-rotate-file |
| Documentation | swagger-ui-express |
| Utilities | dotenv, uuid |
| API Communication | axios |
| Server State | React Query |
| Global State | Zustand |
| Forms | React Hook Form |
| Routing | React Router |
| Tables | TanStack React Table |
| Charts | Recharts |
| Animations | Framer Motion |
| Date Utilities | date-fns |
| Styling Utilities | clsx, tailwind-merge |
| Icons | lucide-react |
| Excel Support | xlsx |
| UI Framework | React, React DOM |