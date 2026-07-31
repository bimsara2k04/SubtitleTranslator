import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';

/**
 * Express error handler.
 *
 * - Logs the full error server-side (including raw Gemini/DB output).
 * - Maps known error types to correct HTTP status codes (e.g. Multer 413).
 * - Never leaks internal error details to the client for 5xx responses.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(`[Error Handler] ${req.method} ${req.originalUrl}:`, err);

  // Multer errors (file too large etc.)
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File exceeds the 5MB upload limit.'
        : err.message;
    res.status(status).json({ error: { code: err.code || 'UPLOAD_ERROR', message } });
    return;
  }

  // Body-parser payload too large
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large.' } });
    return;
  }

  const status = typeof err?.status === 'number' ? err.status : 500;

  if (status >= 500) {
    // Internal error — do not leak internals.
    res.status(status).json({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' },
    });
    return;
  }

  res.status(status).json({
    error: {
      code: err?.code || 'REQUEST_ERROR',
      message: err?.message || 'Request failed.',
    },
  });
}
