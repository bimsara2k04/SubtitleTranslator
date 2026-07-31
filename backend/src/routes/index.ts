import { Router } from 'express';
import { handleUpload } from '../controllers/uploadController.js';
import { handleGetJob, handleStartTranslation, handleRetryChunk } from '../controllers/jobsController.js';
import { handleExport } from '../controllers/exportController.js';
import { uploadMiddleware } from '../middleware/upload.js';
import { requireAuth } from '../middleware/auth.js';
import { createRateLimit } from '../middleware/rateLimit.js';
import { keyPool } from '../services/gemini/keyPool.js';

const router = Router();

// Optional API token auth guards every route when API_TOKEN is set.
router.use(requireAuth);

const uploadLimiter = createRateLimit({ windowMs: 60_000, max: 20 });
const translateLimiter = createRateLimit({ windowMs: 60_000, max: 30 });
const readLimiter = createRateLimit({ windowMs: 60_000, max: 300 });

// Subtitle upload & initial job setup
router.post('/upload', uploadLimiter, uploadMiddleware.single('file'), handleUpload);

// Job details and status
router.get('/jobs/:id', readLimiter, handleGetJob);

// Trigger background translation job
router.post('/jobs/:id/translate', translateLimiter, handleStartTranslation);

// Retry a single failed chunk
router.post('/jobs/:id/retry-chunk/:chunkId', translateLimiter, handleRetryChunk);

// Download exported subtitle file
router.get('/jobs/:id/export', readLimiter, handleExport);

// Key pool quota status (aggregate only — individual key internals stay server-side)
router.get('/quota-status', readLimiter, (_req, res) => {
  const status = keyPool.getKeysStatus();
  const remaining = status.reduce((sum, k) => sum + k.dailyCallsRemaining, 0);
  res.json({
    keyCount: status.length,
    remainingToday: remaining,
    keys: status,
  });
});

export default router;
