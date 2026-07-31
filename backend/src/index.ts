import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { JobsRepository } from './db/repositories/jobs.js';
import { pool } from './db/client.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

app.use(
  cors({
    origin: [frontendUrl],
    credentials: true,
    // Expose Content-Disposition so the frontend can read the real export
    // filename when downloading via fetch()/blob.
    exposedHeaders: ['Content-Disposition'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Minimal request logging (method, path, status, duration)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 500) {
      console.error(`[Request] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    } else {
      console.log(`[Request] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
    }
  });
  next();
});

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// API Routes
app.use('/api', apiRouter);

// Global Error Handler (must be registered last)
app.use(errorHandler);

// Recover jobs that were interrupted by a previous crash/restart so nothing
// stays stuck in "translating" forever.
JobsRepository.recoverStaleJobs()
  .then(() => {
    console.log('[Server] Recovered stale jobs from previous run.');
  })
  .catch((err) => {
    console.error('[Server] Failed to recover stale jobs:', err);
  });

const server = app.listen(port, () => {
  console.log(`[Server] Subtitle Translator Backend listening on http://localhost:${port}`);
});

// Graceful shutdown: stop accepting connections and drain the DB pool.
function shutdown(signal: string) {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    pool.end().then(() => {
      console.log('[Server] Closed database pool. Exiting.');
      process.exit(0);
    });
  });
  // Force exit if graceful shutdown hangs (in-flight jobs may hold the pool).
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
