import { Router } from 'express';
import { handleUpload } from '../controllers/uploadController.js';
import { handleGetJob, handleStartTranslation, handleRetryChunk } from '../controllers/jobsController.js';
import { handleExport } from '../controllers/exportController.js';
import { uploadMiddleware } from '../middleware/upload.js';

const router = Router();

// Subtitle upload & initial job setup
router.post('/upload', uploadMiddleware.single('file'), handleUpload);

// Job details and status
router.get('/jobs/:id', handleGetJob);

// Trigger background translation job
router.post('/jobs/:id/translate', handleStartTranslation);

// Retry a single failed chunk
router.post('/jobs/:id/retry-chunk/:chunkId', handleRetryChunk);

// Download exported subtitle file
router.get('/jobs/:id/export', handleExport);

export default router;
