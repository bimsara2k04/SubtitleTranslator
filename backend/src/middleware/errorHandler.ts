import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('[Error Handler] Caught error:', err);

  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message,
      details: err.details || null,
    },
  });
}
