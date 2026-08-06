# Subtitle Translator

Translate `.srt` subtitle files into 15+ languages with Google's Gemini models — while keeping your timing data intact.

The app parses a subtitle file into structured cue blocks, sends **only the text** to Gemini (timestamps, indexes, and formatting tags never leave your side), translates it in parallel chunks across a pool of API keys, then rebuilds a clean, downloadable `.srt` file.

> **Academic Portfolio Project** — built with structured outputs, a resilient key-pooling quota manager, and a background job pipeline.

---

## ✨ Features

- **Timing-safe translation** — only cue text is sent to the model; `HH:MM:SS,mmm` timestamps, cue indexes, and inline tags (`<i>`, `<b>`, …) are preserved exactly.
- **Structured JSON output** — Gemini is constrained to a JSON schema, so the response is always parseable and matches the expected shape.
- **15+ target languages** — Spanish, French, German, Japanese, Sinhala, Arabic, and more.
- **4 translation tones** — natural, literal, formal, casual.
- **Optional glossary** — enforce specific term mappings (`"AI" -> "IA"`) for consistent terminology.
- **3 Gemini models** — pick between quality and budget (`gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`).
- **Multi-key quota pooling** — distribute load across many Gemini API keys, track per-key daily free-tier quota (resets at midnight PT, DST-aware), auto-rotate on rate limits, and cooldown/lock keys as needed.
- **Parallel background jobs** — chunks translate concurrently (one worker per key by default), with automatic chunk splitting if a context window is exceeded and per-chunk retry.
- **Validation reports** — structural issues are caught before translation; translation integrity is checked after.
- **Live quota dashboard** — the frontend polls an aggregate key-pool status and shows remaining daily requests.
- **Resilient pipeline** — stale jobs recover on restart, graceful shutdown drains the DB pool, and per-endpoint rate limiting protects expensive routes.
- **Optional API token auth** — lock the API behind a Bearer token for anything beyond local dev.

---

## 🧱 Tech Stack

| Layer    | Technology |
| -------- | ---------- |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, `react-dropzone`, `lucide-react` |
| Backend  | Node.js, Express 5, TypeScript |
| Database | PostgreSQL with Drizzle ORM (`drizzle-orm` / `drizzle-kit`) |
| AI       | Google Gemini via `@google/genai` (structured outputs + JSON schema) |

---

## 📁 Project Structure

```
SubtitleTranslator/
├── backend/                 # Express + TypeScript API
│   ├── src/
│   │   ├── index.ts         # App bootstrap, CORS, graceful shutdown
│   │   ├── routes/          # /api/* route definitions
│   │   ├── controllers/     # upload, jobs, export handlers
│   │   ├── middleware/      # auth, rate limiting, multer upload
│   │   ├── services/
│   │   │   ├── srt/         # SRT parse / validate / format
│   │   │   ├── jobs/        # job creation, background worker, rebuild
│   │   │   └── gemini/      # key pool, prompts, translate, schema
│   │   └── db/              # Drizzle schema + repositories
│   └── drizzle.config.mjs
├── frontend/                # Next.js App Router
│   ├── app/
│   │   ├── page.tsx         # Upload page + quota dashboard
│   │   └── jobs/[id]/       # Job status, ChunkGrid, preview, validation
│   └── lib/                 # API client + shared types
├── setup.sh / setup.bat     # One-time install & DB setup (macOS / Windows)
├── start.command / start.bat# Start both servers and open the browser
└── .gitignore
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js 18+** (Node 20+ recommended)
- **PostgreSQL** running locally
- **Google Gemini API key(s)** — free tier allows ~20 requests/day per key. Add multiple keys (comma-separated) to raise your throughput.

### 1. One-command setup (macOS / Windows)

On macOS, run:

```bash
./setup.sh
```

On Windows, double-click `setup.bat`.

This checks for Node.js and PostgreSQL, creates the `subtitle_translator` database, generates a `backend/.env` template, installs dependencies, and pushes the schema. Then start everything with `start.command` (or `start.bat`), which launches both servers in new windows and opens `http://localhost:3000`.

### 2. Manual setup

**Backend:**

```bash
cd backend
# Create backend/.env (see the Configuration section below for all options)
npm install
npm run db:push        # create/push the database schema
npm run dev            # http://localhost:3001
```

> Tip: `./setup.sh` generates a ready-to-edit `backend/.env` template for you automatically.

**Frontend:**

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev            # http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000).

---

## ⚙️ Configuration

### `backend/.env`

```env
PORT=3001
FRONTEND_URL=http://localhost:3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/subtitle_translator

# Comma-separated Gemini API keys (one per Google Cloud project).
# A single key also works. More keys = more parallel throughput + daily quota.
GEMINI_API_KEYS=KEY_ONE,KEY_TWO,KEY_THREE

# Optional: protect the API with a Bearer token.
# When set, every request must send "Authorization: Bearer <token>".
# API_TOKEN=

# Optional: number of chunks to translate in parallel.
# Defaults to your API key count (capped at 8).
# MAX_CONCURRENT_CHUNKS=4
```

### `frontend/.env.local`

```env
# Backend URL. Empty = same origin (recommended if the backend is
# reverse-proxied behind Next.js in production).
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

---

## 🔌 API Reference

Base URL: `http://localhost:3001/api`

| Method | Endpoint                        | Description                                        |
| ------ | ------------------------------- | -------------------------------------------------- |
| `POST` | `/upload`                       | Upload an `.srt` + options; creates a job          |
| `GET`  | `/jobs/:id`                     | Job details, chunk status, and validation issues   |
| `POST` | `/jobs/:id/translate`           | Kick off background translation (returns `202`)    |
| `POST` | `/jobs/:id/retry-chunk/:chunkId`| Reset + retry a single failed chunk                |
| `GET`  | `/jobs/:id/export`              | Download the translated `.srt` file                |
| `GET`  | `/quota-status`                 | Aggregate key-pool quota (used by the dashboard)   |
| `GET`  | `/health`                       | Health check                                       |

**Upload request** (`multipart/form-data`):

- `file` — the `.srt` file (max 5 MB)
- `targetLanguage` — e.g. `Spanish`, `Sinhala`, `Japanese` *(required)*
- `model` — `gemini-3.6-flash` (default), `gemini-3.5-flash`, `gemini-3.5-flash-lite`
- `toneStyle` — `natural` (default), `literal`, `formal`, `casual`
- `glossary` — optional term mappings, one `"A" -> "B"` per line

**Auth:** If `API_TOKEN` is set, include `Authorization: Bearer <token>` on every request.

---

## 🧠 How It Works

1. **Parse** — the uploaded SRT is parsed into structured cues (`index`, timestamps, `textLines`). Malformed blocks are recorded as validation issues.
2. **Validate** — structural problems are flagged *before* any translation; an invalid file is rejected up front.
3. **Chunk** — cues are grouped into chunks (up to 500 cues / 60k chars each) so a movie stays within a handful of API requests.
4. **Translate** — a background worker claims chunks atomically and translates them in parallel. Each worker reserves its own API key, so keys are never double-booked. Gemini returns JSON matching a strict schema.
5. **Verify & fallback** — translated output is validated for structural integrity; missing/empty lines fall back to the source text. Context-window errors trigger an automatic chunk split; quota/rate-limit errors rotate keys and apply cooldowns.
6. **Rebuild** — completed chunks are merged back with the *original* timestamps to produce the final `.srt`, stored as an export record.
7. **Export** — download the file; the real filename (non-ASCII-safe) is sent via `Content-Disposition`.

### Job lifecycle

```
pending → parsing → translating → rebuilding → completed
                                ↘ failed (with per-chunk retry)
```

---

## 🧪 Tests

The backend uses Node's built-in test runner (`node:test`) via `tsx`.

```bash
cd backend
npm test               # SRT parsing, timestamp math, chunking, key-pool, job schemas
```

---

## 🔧 Scripts

| Command             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Run the backend with hot reload (backend dir)    |
| `npm run build`     | Compile TypeScript to `dist/` (backend dir)      |
| `npm run start`     | Run the compiled backend (backend dir)           |
| `npm test`          | Run backend unit tests (backend dir)             |
| `npm run db:push`   | Push the Drizzle schema to the database          |
| `npm run db:migrate`| Run Drizzle migrations                           |
| `npm run db:generate`| Generate a Drizzle migration from the schema    |
| `npm run dev`       | Start the Next.js dev server (frontend dir)      |
| `npm run build`     | Production build (frontend dir)                  |

---

## 🤝 Contributing

1. Fork the repo and create a feature branch.
2. Write code that matches the existing style (typed, commented at the "why", tests for core logic).
3. Add/adjust tests under `backend/src` for any SRT or job-logic changes.
4. Open a pull request.

---

## 📄 License

This is an academic portfolio project. See the repository for licensing details.
