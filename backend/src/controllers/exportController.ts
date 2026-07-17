import type { Request, Response, NextFunction } from 'express';
import { ExportsRepository } from '../db/repositories/exports.js';
import { JobsRepository } from '../db/repositories/jobs.js';

export async function handleExport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ error: { message: 'Missing job id' } });
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

    // Set headers to trigger file download
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(exportRecord.filename)}"`
    );

    res.send(exportRecord.content);
  } catch (error) {
    next(error);
  }
}
