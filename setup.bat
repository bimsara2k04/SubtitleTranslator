@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   Subtitle Translator - Windows Auto-Setup Utility
echo ===================================================
echo.
echo This script will check for and install prerequisites:
echo 1. Node.js (via Windows Package Manager - winget)
echo 2. PostgreSQL (via Windows Package Manager - winget)
echo.
echo Please run this script as Administrator if installations are required.
echo.
pause

:: --- 1. CHECK & INSTALL NODE.JS ---
echo.
echo Checking for Node.js...
where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
    echo [OK] Node.js is already installed (!NODE_VER!)
) else (
    echo [Info] Node.js is missing. Installing Node.js LTS via winget...
    winget install --id OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    if !ERRORLEVEL! neq 0 (
        echo [Error] Failed to install Node.js automatically.
        echo Please install it manually from: https://nodejs.org/
        pause
        exit /b 1
    )
    echo [Success] Node.js installed! You may need to restart this terminal to use the command line.
)

:: --- 2. CHECK & INSTALL POSTGRESQL ---
echo.
echo Checking for PostgreSQL...
sc query postgresql-x64-16 >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] PostgreSQL service is detected.
) else (
    where psql >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo [OK] PostgreSQL (psql) is already installed.
    ) else (
        echo [Info] PostgreSQL is missing. Installing PostgreSQL via winget...
        winget install --id PostgreSQL.PostgreSQL --silent --accept-source-agreements --accept-package-agreements
        if !ERRORLEVEL! neq 0 (
            echo [Error] Failed to install PostgreSQL automatically.
            echo Please install it manually from: https://www.postgresql.org/download/windows/
            pause
            exit /b 1
        )
        echo [Success] PostgreSQL installed! Default superuser is 'postgres' with no password or database configured.
        echo [Important] Please ensure PostgreSQL service is started and has a database matching your .env file.
    )
)

:: --- 2.5 CREATE DATABASE ---
echo.
echo Checking database existence...
set "PG_BIN="
for /d %%d in ("C:\Program Files\PostgreSQL\*") do (
    if exist "%%d\bin\createdb.exe" (
        set "PG_BIN=%%d\bin"
    )
)

if defined PG_BIN (
    echo Attempting to create database 'subtitle_translator' using postgres superuser...
    :: Use default superuser 'postgres' with no password setup (default local config)
    :: Set PGPASSWORD environment variable to 'postgres' just in case
    set "PGPASSWORD=postgres"
    "!PG_BIN!\createdb.exe" -U postgres subtitle_translator >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [Success] Database 'subtitle_translator' created!
    ) else (
        echo [OK] Database 'subtitle_translator' already exists or requires manual creation.
    )
) else (
    echo [Warning] Could not locate PostgreSQL binaries to auto-create the database. 
    echo If this is a fresh install, please create a database named 'subtitle_translator' manually.
)

:: --- 3. PROJECT DEPENDENCIES & SETUP ---
echo.
echo ===================================================
echo   Installing Project Dependencies
echo ===================================================
echo.

if not exist "backend\.env" (
    echo [Warning] backend\.env is missing! Creating a template...
    echo PORT=3001> backend\.env
    echo FRONTEND_URL=http://localhost:3000>> backend\.env
    echo DATABASE_URL=postgresql://postgres:postgres@localhost:5432/subtitle_translator>> backend\.env
    echo GEMINI_API_KEYS=YOUR_GEMINI_API_KEY_HERE>> backend\.env
    echo [Action Required] Please open backend\.env and set your GEMINI_API_KEYS!
)

echo.
echo Installing backend dependencies...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [Error] Failed to install backend dependencies.
    pause
    exit /b 1
)

echo.
echo Setting up database schema (Drizzle)...
call npm run db:push
if %ERRORLEVEL% neq 0 (
    echo [Warning] Database push failed. 
    echo This is expected if PostgreSQL service is not yet fully running or if credentials in backend\.env do not match.
    echo You can run 'npx drizzle-kit push' manually inside 'backend' folder later.
)

echo.
echo Installing frontend dependencies...
cd ../frontend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [Error] Failed to install frontend dependencies.
    pause
    exit /b 1
)

:: --- 4. START THE APPLICATION ---
echo.
echo ===================================================
echo   Starting the Application
echo ===================================================
echo.
echo Starting backend server on http://localhost:3001 ...
start cmd /k "cd ../backend && npm run dev"

echo Starting frontend server on http://localhost:3000 ...
start cmd /k "cd ../frontend && npm run dev"

echo.
echo ===================================================
echo   Setup completed! 
echo   Make sure you edited backend\.env with your API key.
echo   Open http://localhost:3000 in your web browser.
echo ===================================================
pause
