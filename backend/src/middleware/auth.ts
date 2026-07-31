import type { Request, Response, NextFunction } from 'express';

/**
 * Optional API token authentication.
 *
 * If `API_TOKEN` is set in the environment, all requests must present it via
 * the `Authorization: Bearer <token>` header (or `x-api-token`). When unset,
 * the API is open — suitable for trusted local development only.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.API_TOKEN;
  if (!token) {
    next();
    return;
  }

  const header = req.headers.authorization || '';
  const provided =
    header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim()
    : typeof req.headers['x-api-token'] === 'string' ? (req.headers['x-api-token'] as string)
    : '';

  if (!provided || provided !== token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API token.' } });
    return;
  }

  next();
}
