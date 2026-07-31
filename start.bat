@echo off
echo ===================================================
echo   Subtitle Translator - Local Startup Script (Windows)
echo ===================================================

echo [1/4] Installing backend dependencies...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to install backend dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo [2/4] Migrating database (Drizzle Push)...
call npm run db:push
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to push database schema. Make sure PostgreSQL is running and DATABASE_URL in backend/.env is correct.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/4] Installing frontend dependencies...
cd ../frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to install frontend dependencies.
    pause
    exit /b %ERRORLEVEL%
)

echo [4/4] Starting servers concurrently...
start cmd /k "cd ../backend && npm run dev"
start cmd /k "cd ../frontend && npm run dev"

echo ===================================================
echo   Done! Open http://localhost:3000 in your browser.
echo ===================================================
pause
