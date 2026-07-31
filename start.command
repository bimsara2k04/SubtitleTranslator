#!/bin/zsh

# Set PATH to include common locations for Node and Postgres
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Move to the directory containing this script
cd "$(dirname "$0")"
SCRIPT_DIR="$(pwd)"

echo "==================================================="
echo "  Subtitle Translator - macOS Startup Script"
echo "==================================================="
echo

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed or not in PATH."
    echo "Please install Node.js from https://nodejs.org/ or run 'brew install node'"
    echo "Press any key to exit..."
    read -r
    exit 1
fi
echo "✅ Node.js found: $(node -v)"

# 2. Check/Add PostgreSQL bin path
PG_BIN=""
if command -v pg_isready &> /dev/null; then
    PG_BIN="$(dirname "$(command -v pg_isready)")"
else
    # Search common manual installer locations
    for pg_dir in /Library/PostgreSQL/*; do
        if [ -x "$pg_dir/bin/pg_isready" ]; then
            PG_BIN="$pg_dir/bin"
            export PATH="$PG_BIN:$PATH"
            break
        fi
    done
fi

# 3. Check if PostgreSQL is running
if [ -n "$PG_BIN" ] && [ -x "$PG_BIN/pg_isready" ]; then
    if ! "$PG_BIN/pg_isready" -h localhost &>/dev/null; then
        echo "⚠️ PostgreSQL is installed but not running."
        echo "Attempting to start PostgreSQL service..."
        # If installed via Homebrew
        if command -v brew &>/dev/null && brew services list | grep -q postgresql; then
            brew services start postgresql
        else
            echo "Please start your PostgreSQL server manually and press enter to continue..."
            read -r
        fi
    else
        echo "✅ PostgreSQL is running and accepting connections."
    fi
else
    # Fallback check using netcat
    if ! nc -z localhost 5432 &>/dev/null; then
        echo "⚠️ PostgreSQL port 5432 is not responding."
        echo "Please make sure PostgreSQL is running and press enter to continue..."
        read -r
    fi
fi

# 4. Check backend/.env and create default if missing
if [ ! -f "backend/.env" ]; then
    echo "⚠️ backend/.env is missing. Creating a template..."
    cat <<EOT > backend/.env
PORT=3001
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/subtitle_translator
# Comma-separated Gemini API keys (one per project). Also supports GEMINI_API_KEY.
GEMINI_API_KEYS=YOUR_GEMINI_API_KEY_HERE
# Optional: set to protect the API with a token (sent as "Authorization: Bearer <token>").
# API_TOKEN=
# Optional: number of chunks to translate in parallel. Defaults to your key count.
# MAX_CONCURRENT_CHUNKS=4
EOT
    echo "⚠️ A template backend/.env has been created. Please edit it to add your GEMINI_API_KEY."
fi

# 5. Extract database password
DB_PASS="postgres"
if [ -f "backend/.env" ]; then
    DB_URL_VAL=$(grep -E "^DATABASE_URL=" backend/.env | cut -d'=' -f2-)
    if [ -n "$DB_URL_VAL" ]; then
        # Extract part after postgresql://
        TEMP_URL="${DB_URL_VAL#*://}"
        # Extract part before @
        USER_PASS="${TEMP_URL%%@*}"
        # Extract password (part after :)
        if [[ "$USER_PASS" == *:* ]]; then
            DB_PASS="${USER_PASS#*:}"
        else
            DB_PASS=""
        fi
    fi
fi

# 6. Check/Create database
if [ -n "$PG_BIN" ] && [ -x "$PG_BIN/psql" ]; then
    echo "🗄️ Checking database existence..."
    # Check if database exists
    DB_EXISTS=$(PGPASSWORD="$DB_PASS" "$PG_BIN/psql" -U postgres -h localhost -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw subtitle_translator && echo "yes" || echo "no")
    if [ "$DB_EXISTS" = "no" ]; then
        echo "Creating database 'subtitle_translator'..."
        if PGPASSWORD="$DB_PASS" "$PG_BIN/createdb" -U postgres -h localhost subtitle_translator 2>/dev/null; then
            echo "✅ Database created successfully."
        else
            echo "⚠️ Failed to auto-create database. Please create it manually if needed."
        fi
    else
        echo "✅ Database 'subtitle_translator' exists."
    fi
fi

# 7. Check and install dependencies
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Backend dependencies missing. Installing..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Frontend dependencies missing. Installing..."
    cd frontend && npm install && cd ..
fi

# 8. Database push
echo "🗄️ Running database migration/push..."
cd backend && npm run db:push && cd ..

# 9. Start backend and frontend in new Terminal windows
echo "🚀 Starting backend server on http://localhost:3001..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/backend' && npm run dev\""

echo "🚀 Starting frontend server on http://localhost:3000..."
osascript -e "tell application \"Terminal\" to do script \"cd '$SCRIPT_DIR/frontend' && npm run dev\""

# 10. Wait and open browser
echo "🌐 Opening web browser to http://localhost:3000..."
sleep 3
open "http://localhost:3000"

echo
echo "==================================================="
echo "🎉 Setup / Startup completed successfully!"
echo "You can close this setup window now."
echo "==================================================="
sleep 1
exit 0
