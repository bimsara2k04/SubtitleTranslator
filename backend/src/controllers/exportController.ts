import type { Request, Response, NextFunction } from 'express';
import { ExportsRepository } from '../db/repositories/exports.js';
import { JobsRepository } from '../db/repositories/jobs.js';
import { isValidUuid } from '../utils/validate.js';

/** Strip anything that could break HTTP header parsing. */
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"]/g, '_').replace(/\\/g, '_');
}

export async function handleExport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!isValidUuid(id)) {
      res.status(400).json({ error: { code: 'INVALID_ID', message: 'Invalid job id.' } });
      return;
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: { message: 'Job not found' } });
      return;
    }

    const exportRecord = await ExportsRepository.findByJobId(id);
    if (!exportRecord) {
      res.status(404).json({
        error: {
          code: 'EXPORT_NOT_FOUND',
          message: 'Export file has not been built yet. Make sure translation is completed.',
        },
      });
      return;
    }

    const filename = sanitizeFilename(exportRecord.filename);

    // Set headers to trigger file download. Use RFC 5987 encoding so non-ASCII
    // names download correctly instead of showing percent-encoded text.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    res.send(exportRecord.content);
  } catch (error) {
    next(error);
  }
}
