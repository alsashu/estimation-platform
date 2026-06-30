# Quick start

```bash
  cd automation
  npm install
  cp .env.example .env      # fill in BASE_URL and credentials

  npm test                  # all tests (Chrome)
  npm run test:auth         # single module
  npm run test:headless     # headless mode
  npm run test:ci           # CI mode (headless + Chrome)

  npm run report:generate   # generate Allure report
  npm run report:allure     # generate + open in browser
  npm run dashboard         # generate reports/dashboard.html

  npm run test:headed          # HEADLESS=false (explicit)
  npm run test:demo            # HEADLESS=false + SLOW_MOTION_MS=800 (all tests)
  npm run test:demo:auth       # slow-motion auth tests only — good for live demos
  
  npm run test:smoke → 5–10 minutes
  npm run test:parallel → 15–20 minutes (was 2.5 h)
  npm run test:headed → 35–45 minutes (was 2.5 h, sequential fallback)
```

# Estimation Platform — Selenium Automation Framework

End-to-end test suite built with **Selenium WebDriver 4.x**, **Mocha**, **Chai**, **Page Object Model**, and **Allure Reports**.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20.x LTS |
| Chrome / Firefox / Edge | Latest stable |
| ChromeDriver / GeckoDriver | Matching browser version |

---

## Installation

```bash
cd automation
npm install
```

---

## Configuration

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Key variables in `.env`:

```
BASE_URL=http://localhost:3000
API_BASE_URL=http://localhost:4000
BROWSER=chrome
HEADLESS=true

GSA_EMAIL=gsa@estimation.local
GSA_PASSWORD=GSA@Secure2026!

ADMIN_EMAIL=admin@estimation.local
ADMIN_PASSWORD=Admin@Secure2026!

USER_EMAIL=user@estimation.local
USER_PASSWORD=User@Secure2026!

INACTIVE_EMAIL=inactive@estimation.local
INACTIVE_PASSWORD=Inactive@Secure2026!
```

The `testdata/credentials.json` fixture mirrors these — update both if you change credentials.

---

## Running Tests

```bash
# Full suite
npm test

# Headed mode (see browser)
npm run test:headed

# Single module
npm run test:auth
npm run test:users
npm run test:rbac

# By browser
BROWSER=firefox npm test
BROWSER=edge npm test

# Generate and open Allure report
npm run report:generate
npm run report:open
```

Available npm scripts (from `package.json`):

| Script | Description |
|--------|-------------|
| `npm test` | Run all tests headless |
| `npm run test:headed` | Run all tests with browser visible |
| `npm run test:auth` | Authentication suite only |
| `npm run test:users` | User management suite only |
| `npm run test:rbac` | RBAC suite only |
| `npm run test:security` | Security suite only |
| `npm run test:regression` | Regression suite only |
| `npm run report:generate` | Build Allure HTML report |
| `npm run report:open` | Open Allure report in browser |
| `npm run report:dashboard` | Generate standalone dashboard HTML |
| `npm run lint` | Run ESLint |

---

## Project Structure

```
automation/
├── config/
│   ├── config.js           # Central config (loads .env)
│   └── browsers.js         # Browser options factory
├── helpers/
│   ├── AuthHelper.js       # Login/logout helpers per role
│   ├── ReportHelper.js     # Allure label/step helpers
│   ├── SetupHelper.js      # Mocha root hooks (dirs, screenshots)
│   ├── TestDataHelper.js   # Faker-based test data generators
│   └── WaitHelper.js       # Explicit wait wrappers
├── pages/                  # Page Object Model
│   ├── BasePage.js
│   ├── LoginPage.js
│   ├── DashboardPage.js
│   ├── UsersPage.js
│   ├── ProjectsPage.js
│   ├── RolesPage.js
│   ├── EstimationPage.js
│   ├── HistoricalDataPage.js
│   ├── AnalyticsPage.js
│   ├── MasterDataPage.js
│   ├── RegistrationPage.js
│   ├── NotificationsPage.js
│   └── MonitoringPage.js
├── tests/
│   ├── authentication/     # TC-AUTH-001..014
│   ├── users/              # TC-USR-001..014
│   ├── projects/           # TC-PRJ-001..006
│   ├── rbac/               # TC-RBAC-001..013
│   ├── dashboard/          # TC-DASH-001..006
│   ├── storypoint/         # TC-STORY-001..006
│   ├── parametric/         # TC-PARAM-001..004
│   ├── historical/         # TC-HIST-001..007
│   ├── analytics/          # TC-ANLYT-001..005
│   ├── masterdata/         # TC-MDATA-001..006
│   ├── registration/       # TC-REG-001..005
│   ├── notifications/      # TC-NOTIF-001..005
│   ├── security/           # TC-SEC-001..010
│   └── regression/         # TC-REG-001..007
├── testdata/
│   ├── credentials.json
│   ├── users.json
│   ├── projects.json
│   └── estimations.json
├── utils/
│   ├── ApiUtil.js          # Axios API wrapper
│   ├── DashboardGenerator.js # Standalone HTML dashboard
│   ├── DriverFactory.js    # WebDriver builder
│   ├── LoggerUtil.js       # Winston logger
│   └── ScreenshotUtil.js   # Screenshot capture
├── screenshots/            # Failure screenshots (gitkeep)
├── logs/                   # Test run logs (gitkeep)
├── reports/                # Allure HTML output (gitkeep)
├── allure-results/         # Allure JSON results (gitkeep)
├── .env.example
├── .mocharc.cjs
├── .eslintrc.cjs
├── package.json
├── Jenkinsfile
├── azure-pipelines.yml
└── .github/workflows/selenium.yml
```

---

## Test Coverage

| Module | Test IDs | Count |
|--------|----------|-------|
| Authentication | TC-AUTH-001..014 | 14 |
| User Management | TC-USR-001..014 | 14 |
| Project Management | TC-PRJ-001..006 | 6 |
| RBAC | TC-RBAC-001..013 | 13 |
| Dashboard | TC-DASH-001..006 | 6 |
| Story Point Estimation | TC-STORY-001..006 | 6 |
| Parametric Estimation | TC-PARAM-001..004 | 4 |
| Historical Data | TC-HIST-001..007 | 7 |
| Analytics | TC-ANLYT-001..005 | 5 |
| Master Data | TC-MDATA-001..006 | 6 |
| Registration | TC-REG-001..005 | 5 |
| Notifications | TC-NOTIF-001..005 | 5 |
| Security | TC-SEC-001..010 | 10 |
| Regression | TC-REG-001..007 | 7 |
| **Total** | | **108** |

---

## Reporting

### Allure Report

```bash
npm run report:generate   # generates to reports/
npm run report:open       # opens in default browser
```

### Standalone Dashboard

```bash
npm run report:dashboard  # generates reports/dashboard.html (no server needed)
```

The dashboard includes:
- Pass/fail/skip doughnut chart
- Per-module stacked bar chart
- Total test count and duration

---

## CI/CD Integration

### GitHub Actions
`.github/workflows/selenium.yml` — triggers on push to `main`/`develop`, PRs, and nightly at 02:00 UTC.

### Azure DevOps
`azure-pipelines.yml` — same trigger logic, publishes test results to Azure Test Plans.

### Jenkins
`Jenkinsfile` — parametrised pipeline with browser selection. Credentials stored in Jenkins credential store.

---

## Adding New Tests

1. Create `tests/<module>/<module>.test.js`
2. Create `pages/<Module>Page.js` extending `BasePage`
3. Add API helpers to `utils/ApiUtil.js` if needed
4. Register the spec glob in `.mocharc.cjs` (or it's already covered by `tests/**/*.test.js`)
5. Add test IDs to the coverage table above

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `SessionNotCreatedException` | ChromeDriver version mismatch — run `npx chromedriver --version` and match Chrome |
| `WebDriverError: ECONNREFUSED` | App not running — start backend + frontend first |
| Tests timeout in CI | Increase `--timeout` in `.mocharc.cjs` or check HEADLESS=true |
| `StaleElementReferenceError` | BasePage handles retry automatically via `findElement` |
| Allure report empty | Run `npm run report:generate` after test run |
