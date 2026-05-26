@echo off
setlocal enabledelayedexpansion
title Estimation Platform — Setup

:: ============================================================================
::  ESTIMATION PLATFORM — STARTUP SCRIPT
::  No Docker required. Handles full environment setup automatically.
:: ============================================================================

:: ---------------------------------------------------------------------------
:: 0. ANSI COLOUR SUPPORT (Windows 10 1511+ supports VT sequences)
:: ---------------------------------------------------------------------------
for /f "tokens=4-5 delims=. " %%i in ('ver') do set WIN_VER=%%i
reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul 2>&1

for /f %%a in ('echo prompt $E^| cmd /q') do set "ESC=%%a"
set "C_RESET=%ESC%[0m"
set "C_BOLD=%ESC%[1m"
set "C_RED=%ESC%[91m"
set "C_GREEN=%ESC%[92m"
set "C_YELLOW=%ESC%[93m"
set "C_BLUE=%ESC%[94m"
set "C_MAGENTA=%ESC%[95m"
set "C_CYAN=%ESC%[96m"
set "C_WHITE=%ESC%[97m"
set "C_DIM=%ESC%[2m"
set "C_BG_DARK=%ESC%[48;2;30;50;70m"
set "C_BG_GREEN=%ESC%[48;2;25;170;110m"

:: ---------------------------------------------------------------------------
:: 1. ROOT DIRECTORY (where this script lives)
:: ---------------------------------------------------------------------------
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BACKEND=%ROOT%\backend"
set "FRONTEND=%ROOT%\frontend"

:: ---------------------------------------------------------------------------
:: 2. BANNER
:: ---------------------------------------------------------------------------
cls
echo.
echo %C_BG_DARK%%C_WHITE%%C_BOLD%  ================================================================  %C_RESET%
echo %C_BG_DARK%%C_WHITE%%C_BOLD%                                                                  %C_RESET%
echo %C_BG_DARK%%C_CYAN%%C_BOLD%          ESTIMATION PLATFORM  —  Startup Manager                %C_RESET%
echo %C_BG_DARK%%C_WHITE%          React  ^|  Node.js  ^|  PostgreSQL  ^|  PWA                    %C_RESET%
echo %C_BG_DARK%%C_WHITE%%C_BOLD%                                                                  %C_RESET%
echo %C_BG_DARK%%C_WHITE%%C_BOLD%  ================================================================  %C_RESET%
echo.
call :log_info "Working directory: %ROOT%"
echo.

:: ---------------------------------------------------------------------------
:: 3. PREREQUISITE CHECKS
:: ---------------------------------------------------------------------------
call :section "STEP 1 — CHECKING PREREQUISITES"

:: — Node.js —
call :check_start "Node.js"
where node >nul 2>&1
if errorlevel 1 (
    call :check_fail "Node.js is NOT installed"
    call :log_error "Download from: https://nodejs.org (v20 LTS recommended)"
    call :fatal "Cannot continue without Node.js."
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do set NODE_VER=%%v
call :check_pass "Node.js %NODE_VER%"

:: — npm —
call :check_start "npm"
where npm >nul 2>&1
if errorlevel 1 (
    call :check_fail "npm not found (should ship with Node.js)"
    call :fatal "Cannot continue without npm."
)
for /f "tokens=*" %%v in ('npm --version 2^>nul') do set NPM_VER=%%v
call :check_pass "npm v%NPM_VER%"

:: — Node.js version gate (require >= 18) —
for /f "tokens=1 delims=." %%m in ('node -e "process.stdout.write(process.versions.node)" 2^>nul') do set NODE_MAJOR=%%m
if !NODE_MAJOR! LSS 18 (
    call :check_fail "Node.js %NODE_VER% is below the minimum required version (v18)"
    call :fatal "Please upgrade Node.js to v18 or later."
)

:: — PowerShell (for HTTP health-check probes) —
call :check_start "PowerShell"
where powershell >nul 2>&1
if errorlevel 1 (
    call :check_fail "PowerShell not found"
    call :fatal "PowerShell is required for health checks."
)
call :check_pass "PowerShell available"

echo.

:: ---------------------------------------------------------------------------
:: 4. FIND POSTGRESQL
:: ---------------------------------------------------------------------------
call :section "STEP 2 — LOCATING POSTGRESQL"

set "PSQL_EXE="
set "PGBIN="

:: Try psql already in PATH
where psql >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=*" %%p in ('where psql 2^>nul') do (
        if not defined PSQL_EXE set "PSQL_EXE=%%p"
    )
)

:: Scan common installation paths if not found yet
if not defined PSQL_EXE (
    for %%V in (17 16 15 14 13 12) do (
        if not defined PSQL_EXE (
            for %%D in (
                "C:\Program Files\PostgreSQL\%%V\bin\psql.exe"
                "C:\Program Files (x86)\PostgreSQL\%%V\bin\psql.exe"
                "%LOCALAPPDATA%\Programs\PostgreSQL\%%V\bin\psql.exe"
            ) do (
                if not defined PSQL_EXE (
                    if exist %%D (
                        set "PSQL_EXE=%%~D"
                        for %%F in ("%%~dpD.") do set "PGBIN=%%~fF"
                    )
                )
            )
        )
    )
)

:: Scoop / Chocolatey / Winget known locations
if not defined PSQL_EXE (
    for %%D in (
        "%USERPROFILE%\scoop\apps\postgresql\current\bin\psql.exe"
        "C:\ProgramData\chocolatey\lib\postgresql\tools\bin\psql.exe"
        "C:\tools\postgresql\bin\psql.exe"
    ) do (
        if not defined PSQL_EXE (
            if exist %%D set "PSQL_EXE=%%~D"
        )
    )
)

if not defined PSQL_EXE (
    call :check_fail "psql.exe not found"
    echo.
    echo %C_YELLOW%  PostgreSQL does not appear to be installed or is not on PATH.%C_RESET%
    echo %C_YELLOW%  Download: https://www.postgresql.org/download/windows/%C_RESET%
    echo %C_YELLOW%  After installing, re-run this script.%C_RESET%
    echo.
    call :fatal "Cannot continue without PostgreSQL."
)

call :check_pass "psql found: %PSQL_EXE%"

:: Add psql's folder to PATH for this session
if defined PGBIN (
    set "PATH=%PGBIN%;%PATH%"
)

echo.

:: ---------------------------------------------------------------------------
:: 5. ENVIRONMENT CONFIGURATION
:: ---------------------------------------------------------------------------
call :section "STEP 3 — ENVIRONMENT CONFIGURATION"

:: Default connection values
set "EP_DB_HOST=localhost"
set "EP_DB_PORT=5432"
set "EP_DB_NAME=estimation_db"
set "EP_DB_USER=estimation_user"
set "EP_DB_PASS=estimation_pass"
set "EP_BACKEND_PORT=4000"
set "EP_FRONTEND_PORT=3000"

:: Read existing backend .env if present
if exist "%BACKEND%\.env" (
    call :check_pass "backend\.env already exists — reading values"
    for /f "usebackq tokens=1,* delims==" %%k in ("%BACKEND%\.env") do (
        set "_K=%%k"
        set "_V=%%l"
        if "!_K!"=="DATABASE_URL" set "ENV_DB_URL=!_V!"
        if "!_K!"=="PORT" set "EP_BACKEND_PORT=!_V!"
    )
) else (
    call :log_warn "backend\.env not found — creating with defaults"
    call :write_backend_env
    call :check_pass "backend\.env created"
)

echo.

:: ---------------------------------------------------------------------------
:: 6. POSTGRESQL SERVICE CHECK
:: ---------------------------------------------------------------------------
call :section "STEP 4 — POSTGRESQL CONNECTIVITY"

:: Try pg_isready if available, else probe with psql
set "PG_RUNNING=0"
where pg_isready >nul 2>&1
if not errorlevel 1 (
    pg_isready -h %EP_DB_HOST% -p %EP_DB_PORT% >nul 2>&1
    if not errorlevel 1 set "PG_RUNNING=1"
) else (
    "%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c "" >nul 2>&1
    if not errorlevel 1 set "PG_RUNNING=1"
)

if "!PG_RUNNING!"=="0" (
    call :log_warn "PostgreSQL does not appear to be running. Attempting to start service..."

    :: Try to start the service (most installers create pg service named postgresql-XX)
    set "PG_STARTED=0"
    for %%V in (17 16 15 14 13 12) do (
        if "!PG_STARTED!"=="0" (
            sc query "postgresql-x64-%%V" >nul 2>&1
            if not errorlevel 1 (
                call :log_info "Starting service: postgresql-x64-%%V"
                net start "postgresql-x64-%%V" >nul 2>&1
                timeout /t 3 /nobreak >nul
                set "PG_STARTED=1"
            )
        )
    )

    :: Re-check
    set "PG_RUNNING=0"
    where pg_isready >nul 2>&1
    if not errorlevel 1 (
        pg_isready -h %EP_DB_HOST% -p %EP_DB_PORT% >nul 2>&1
        if not errorlevel 1 set "PG_RUNNING=1"
    ) else (
        "%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c "\q" >nul 2>&1
        if not errorlevel 1 set "PG_RUNNING=1"
    )

    if "!PG_RUNNING!"=="0" (
        call :check_fail "PostgreSQL is not running and could not be started automatically"
        echo.
        echo %C_YELLOW%  Please start the PostgreSQL service manually:%C_RESET%
        echo %C_YELLOW%  Services panel (services.msc) ^> find 'postgresql' ^> Start%C_RESET%
        echo %C_YELLOW%  Then re-run this script.%C_RESET%
        echo.
        call :fatal "PostgreSQL service not running."
    )
)

call :check_pass "PostgreSQL is running on %EP_DB_HOST%:%EP_DB_PORT%"
echo.

:: ---------------------------------------------------------------------------
:: 7. DATABASE & USER SETUP
:: ---------------------------------------------------------------------------
call :section "STEP 5 — DATABASE SETUP"

:: Determine postgres superuser password to use for admin tasks
set "PGPASS_SUPER="

:: Probe with empty password first
set "PGPASSWORD="
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c "\q" >nul 2>&1
if not errorlevel 1 (
    set "PGPASS_SUPER="
    call :log_info "Connected as postgres (no password)"
    goto :db_setup
)

:: Probe with 'postgres' as password
set "PGPASSWORD=postgres"
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c "\q" >nul 2>&1
if not errorlevel 1 (
    set "PGPASS_SUPER=postgres"
    call :log_info "Connected as postgres (password: postgres)"
    goto :db_setup
)

:: Probe with 'admin' as password
set "PGPASSWORD=admin"
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c "\q" >nul 2>&1
if not errorlevel 1 (
    set "PGPASS_SUPER=admin"
    call :log_info "Connected as postgres (password: admin)"
    goto :db_setup
)

:: Can we already connect as estimation_user? Then skip superuser step
set "PGPASSWORD=%EP_DB_PASS%"
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U %EP_DB_USER% -d %EP_DB_NAME% -c "\q" >nul 2>&1
if not errorlevel 1 (
    call :check_pass "Database '%EP_DB_NAME%' and user '%EP_DB_USER%' already configured"
    goto :db_verified
)

:: Prompt for superuser password
echo.
echo %C_YELLOW%  Could not connect as postgres with common passwords.%C_RESET%
echo %C_YELLOW%  Please enter your PostgreSQL superuser (postgres) password:%C_RESET%
echo %C_DIM%  (Leave blank and press Enter if no password is set)%C_RESET%
set /p "PGPASS_SUPER=  Password: "
set "PGPASSWORD=%PGPASS_SUPER%"

"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c "\q" >nul 2>&1
if errorlevel 1 (
    call :check_fail "Could not authenticate as postgres superuser"
    echo.
    echo %C_YELLOW%  Manual setup required — run the following in psql as superuser:%C_RESET%
    echo %C_CYAN%    CREATE USER %EP_DB_USER% WITH PASSWORD '%EP_DB_PASS%';%C_RESET%
    echo %C_CYAN%    CREATE DATABASE %EP_DB_NAME% OWNER %EP_DB_USER%;%C_RESET%
    echo %C_CYAN%    GRANT ALL PRIVILEGES ON DATABASE %EP_DB_NAME% TO %EP_DB_USER%;%C_RESET%
    echo.
    call :fatal "Database setup failed. See instructions above."
)

:db_setup
set "PGPASSWORD=%PGPASS_SUPER%"

:: Create role (ignore error if already exists)
call :log_info "Creating database user '%EP_DB_USER%' (if not exists)..."
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c ^
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname='%EP_DB_USER%') THEN CREATE ROLE %EP_DB_USER% LOGIN PASSWORD '%EP_DB_PASS%'; END IF; END $$;" >nul 2>&1

:: Create database (ignore error if already exists)
call :log_info "Creating database '%EP_DB_NAME%' (if not exists)..."
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c ^
    "SELECT 'already exists' FROM pg_database WHERE datname='%EP_DB_NAME%'" 2>nul | findstr /i "already exists" >nul 2>&1
if errorlevel 1 (
    "%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c ^
        "CREATE DATABASE %EP_DB_NAME% OWNER %EP_DB_USER% ENCODING 'UTF8';" >nul 2>&1
)

:: Grant privileges
call :log_info "Granting privileges..."
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -c ^
    "GRANT ALL PRIVILEGES ON DATABASE %EP_DB_NAME% TO %EP_DB_USER%;" >nul 2>&1

:: Allow estimation_user to create schemas (needed for uuid-ossp)
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -d %EP_DB_NAME% -c ^
    "GRANT CREATE ON SCHEMA public TO %EP_DB_USER%;" >nul 2>&1

:: Install uuid-ossp extension (needs superuser)
call :log_info "Installing uuid-ossp extension..."
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U postgres -d %EP_DB_NAME% -c ^
    "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >nul 2>&1

:: Verify application user can connect
set "PGPASSWORD=%EP_DB_PASS%"
"%PSQL_EXE%" -h %EP_DB_HOST% -p %EP_DB_PORT% -U %EP_DB_USER% -d %EP_DB_NAME% -c "\q" >nul 2>&1
if errorlevel 1 (
    call :check_fail "Could not verify connection as '%EP_DB_USER%'"
    call :fatal "Database verification failed. Check the password and try again."
)

call :check_pass "Database '%EP_DB_NAME%' ready — user '%EP_DB_USER%' connected"

:db_verified
set "PGPASSWORD="
echo.

:: ---------------------------------------------------------------------------
:: 8. PORT AVAILABILITY
:: ---------------------------------------------------------------------------
call :section "STEP 6 — PORT AVAILABILITY"

call :check_port %EP_BACKEND_PORT% "Backend API"
call :check_port %EP_FRONTEND_PORT% "Frontend"
echo.

:: ---------------------------------------------------------------------------
:: 9. INSTALL DEPENDENCIES
:: ---------------------------------------------------------------------------
call :section "STEP 7 — INSTALLING DEPENDENCIES"

:: — Backend —
call :log_step "Installing backend packages..."
cd /d "%BACKEND%"
if not exist "node_modules" (
    call :log_info "node_modules not found — running npm install (this may take a moment)..."
    npm install --prefer-offline --no-audit --no-fund 2>&1 | powershell -Command "$input | ForEach-Object { if ($_ -match 'added|warn|error') { Write-Host '   ' $_ } }"
    if errorlevel 1 (
        call :check_fail "Backend npm install failed"
        call :fatal "Dependency installation failed."
    )
) else (
    npm install --prefer-offline --no-audit --no-fund >nul 2>&1
    if errorlevel 1 (
        call :check_fail "Backend npm install failed"
        call :fatal "Dependency installation failed."
    )
)
call :check_pass "Backend dependencies ready"

:: — Frontend —
call :log_step "Installing frontend packages..."
cd /d "%FRONTEND%"
if not exist "node_modules" (
    call :log_info "node_modules not found — running npm install (this may take a moment)..."
    npm install --prefer-offline --no-audit --no-fund 2>&1 | powershell -Command "$input | ForEach-Object { if ($_ -match 'added|warn|error') { Write-Host '   ' $_ } }"
    if errorlevel 1 (
        call :check_fail "Frontend npm install failed"
        call :fatal "Dependency installation failed."
    )
) else (
    npm install --prefer-offline --no-audit --no-fund >nul 2>&1
    if errorlevel 1 (
        call :check_fail "Frontend npm install failed"
        call :fatal "Dependency installation failed."
    )
)
call :check_pass "Frontend dependencies ready"

cd /d "%ROOT%"
echo.

:: ---------------------------------------------------------------------------
:: 10. LAUNCH BACKEND
:: ---------------------------------------------------------------------------
call :section "STEP 8 — LAUNCHING SERVICES"

call :log_step "Starting backend API server (port %EP_BACKEND_PORT%)..."

start "%C_BG_DARK% Estimation Platform — Backend API (port %EP_BACKEND_PORT%) %C_RESET%" ^
    cmd /k "title Estimation Platform — Backend API ^& color 17 ^& cd /d "%BACKEND%" ^& echo. ^& echo  [BACKEND] Starting Node.js API server... ^& echo  [BACKEND] Database schema and seed will auto-run on first start. ^& echo. ^& npm run dev"

:: Wait for backend to become healthy (up to 60 seconds)
call :log_info "Waiting for backend to be ready..."
set "HEALTH_OK=0"
set "HEALTH_ATTEMPTS=0"

:health_loop
set /a HEALTH_ATTEMPTS+=1
if !HEALTH_ATTEMPTS! GTR 30 goto :health_timeout

powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%EP_BACKEND_PORT%/health' -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    set "HEALTH_OK=1"
    goto :health_done
)

:: Animated waiting dots
set /a "DOT_IDX = !HEALTH_ATTEMPTS! %% 4"
if !DOT_IDX!==0 set "DOTS=   "
if !DOT_IDX!==1 set "DOTS=.  "
if !DOT_IDX!==2 set "DOTS=.. "
if !DOT_IDX!==3 set "DOTS=..."
<nul set /p "=%C_DIM%  Waiting for API!DOTS! (attempt !HEALTH_ATTEMPTS!/30)%C_RESET%   "
echo(
:: Move cursor up one line to overwrite
<nul set /p "=%ESC%[1A"
timeout /t 2 /nobreak >nul
goto :health_loop

:health_timeout
echo.
call :check_fail "Backend did not become healthy within 60 seconds"
call :log_warn "The backend window may have more details. Check for database connection errors."
echo.
set /p "_CONT=  Continue launching frontend anyway? [Y/N]: "
if /i "!_CONT!"=="N" goto :eof
goto :launch_frontend

:health_done
echo.
call :check_pass "Backend API is healthy at http://localhost:%EP_BACKEND_PORT%"
echo.

:: ---------------------------------------------------------------------------
:: 11. LAUNCH FRONTEND
:: ---------------------------------------------------------------------------
:launch_frontend
call :log_step "Starting frontend development server (port %EP_FRONTEND_PORT%)..."

start "%C_BG_GREEN% Estimation Platform — Frontend UI (port %EP_FRONTEND_PORT%) %C_RESET%" ^
    cmd /k "title Estimation Platform — Frontend UI ^& color 02 ^& cd /d "%FRONTEND%" ^& echo. ^& echo  [FRONTEND] Starting Vite dev server... ^& echo. ^& npm run dev -- --port %EP_FRONTEND_PORT% --host"

:: Give Vite a moment to spin up before opening browser
timeout /t 5 /nobreak >nul

call :check_pass "Frontend server starting at http://localhost:%EP_FRONTEND_PORT%"
echo.

:: ---------------------------------------------------------------------------
:: 12. OPEN BROWSER
:: ---------------------------------------------------------------------------
call :log_info "Opening application in your default browser..."
timeout /t 2 /nobreak >nul
start "" "http://localhost:%EP_FRONTEND_PORT%"

:: ---------------------------------------------------------------------------
:: 13. SUCCESS SUMMARY
:: ---------------------------------------------------------------------------
echo.
echo %C_BG_GREEN%%C_WHITE%%C_BOLD%  ================================================================  %C_RESET%
echo %C_BG_GREEN%%C_WHITE%%C_BOLD%                                                                  %C_RESET%
echo %C_BG_GREEN%%C_WHITE%%C_BOLD%          ESTIMATION PLATFORM IS RUNNING                        %C_RESET%
echo %C_BG_GREEN%%C_WHITE%%C_BOLD%                                                                  %C_RESET%
echo %C_BG_GREEN%%C_WHITE%%C_BOLD%  ================================================================  %C_RESET%
echo.
echo   %C_BOLD%%C_CYAN%Frontend (UI)%C_RESET%      http://localhost:%EP_FRONTEND_PORT%
echo   %C_BOLD%%C_CYAN%Backend  (API)%C_RESET%     http://localhost:%EP_BACKEND_PORT%
echo   %C_BOLD%%C_CYAN%Health check%C_RESET%       http://localhost:%EP_BACKEND_PORT%/health
echo   %C_BOLD%%C_CYAN%Database%C_RESET%           %EP_DB_NAME% @ %EP_DB_HOST%:%EP_DB_PORT%
echo.
echo   %C_DIM%Two windows have been opened:%C_RESET%
echo   %C_DIM%  • "Estimation Platform — Backend API" — Node.js / Express%C_RESET%
echo   %C_DIM%  • "Estimation Platform — Frontend UI" — Vite / React%C_RESET%
echo.
echo   %C_DIM%First-time startup: the backend automatically creates all database%C_RESET%
echo   %C_DIM%tables and seeds master data from EstimationModel.xlsx values.%C_RESET%
echo.
echo   %C_YELLOW%To stop the application:%C_RESET% close the Backend and Frontend windows,
echo   %C_YELLOW%or press Ctrl+C in each.%C_RESET%
echo.
echo %C_DIM%  ================================================================%C_RESET%
echo.

:: ---------------------------------------------------------------------------
:: 14. KEEP THIS WINDOW AS MONITOR
:: ---------------------------------------------------------------------------
call :section "MONITORING (this window stays open)"
echo   %C_DIM%Polling backend health every 10 seconds. Press Ctrl+C to exit.%C_RESET%
echo.

:monitor_loop
timeout /t 10 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%EP_BACKEND_PORT%/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop; $ts = Get-Date -Format 'HH:mm:ss'; Write-Host ('  [' + $ts + '] Backend OK  |  Frontend http://localhost:%EP_FRONTEND_PORT%') } catch { $ts = Get-Date -Format 'HH:mm:ss'; Write-Host ('  [' + $ts + '] Backend unreachable — check the Backend window') }"
goto :monitor_loop


:: ============================================================================
::  HELPER SUBROUTINES
:: ============================================================================

:section
echo %C_BOLD%%C_BLUE%  ── %~1 %C_RESET%
goto :eof

:check_start
<nul set /p "=  %C_DIM%Checking %~1...%C_RESET%"
goto :eof

:check_pass
echo   %C_GREEN%[PASS]%C_RESET% %~1
goto :eof

:check_fail
echo   %C_RED%[FAIL]%C_RESET% %~1
goto :eof

:log_info
echo   %C_CYAN%[INFO]%C_RESET% %~1
goto :eof

:log_warn
echo   %C_YELLOW%[WARN]%C_RESET% %~1
goto :eof

:log_step
echo   %C_MAGENTA%[STEP]%C_RESET% %~1
goto :eof

:log_error
echo   %C_RED%[ERR ]%C_RESET% %~1
goto :eof

:fatal
echo.
echo %C_RED%%C_BOLD%  FATAL: %~1%C_RESET%
echo.
pause
exit /b 1

:check_port
:: Usage: call :check_port <port> <label>
set "_PORT=%~1"
set "_LABEL=%~2"
powershell -Command "if (Get-NetTCPConnection -LocalPort %_PORT% -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }" >nul 2>&1
if errorlevel 1 (
    call :log_warn "Port %_PORT% (%_LABEL%) is already in use — another process may be running there"
    echo   %C_DIM%         If startup fails, stop that process first.%C_RESET%
) else (
    call :check_pass "Port %_PORT% (%_LABEL%) is available"
)
goto :eof

:write_backend_env
(
    echo DATABASE_URL=postgresql://%EP_DB_USER%:%EP_DB_PASS%@%EP_DB_HOST%:%EP_DB_PORT%/%EP_DB_NAME%
    echo PORT=%EP_BACKEND_PORT%
    echo NODE_ENV=development
    echo FRONTEND_URL=http://localhost:%EP_FRONTEND_PORT%
) > "%BACKEND%\.env"
goto :eof
