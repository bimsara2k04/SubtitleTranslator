import type { Request, Response, NextFunction } from 'express';
import { createJob } from '../services/jobs/createJob.js';
import { JobsRepository } from '../db/repositories/jobs.js';
import { looksLikeSRT } from '../services/srt/parse.js';
import { parseUploadBody } from '../services/jobs/schemas.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (matches Multer limit)

export async function handleUpload(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: { code: 'NO_FILE', message: 'No subtitle file uploaded.' } });
      return;
    }

    const parsed = parseUploadBody({
      targetLanguage: req.body?.targetLanguage,
      model: req.body?.model,
      toneStyle: req.body?.toneStyle,
      glossary: req.body?.glossary,
      filename: file.originalname,
    });

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || 'Invalid upload parameters.';
      res.status(400).json({ error: { code: 'INVALID_PARAMS', message } });
      return;
    }

    const { targetLanguage, model, toneStyle, glossary, filename } = parsed.data;

    if (file.size > MAX_FILE_SIZE) {
      res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 5MB limit.' } });
      return;
    }

    const srtContent = file.buffer.toString('utf-8');
    if (!looksLikeSRT(srtContent)) {
      res.status(400).json({
        error: {
          code: 'INVALID_SRT',
          message: 'The file does not appear to be a valid SRT file (missing timestamp markers like -->).',
        },
      });
      return;
    }

    // Create the job
    const result = await createJob({
      filename,
      targetLanguage,
      model,
      toneStyle,
      glossary,
      srtContent,
    });

    const validationIssues = await JobsRepository.getValidationIssues(result.job.id);

    res.status(201).json({
      jobId: result.job.id,
      status: result.job.status,
      valid: result.valid,
      validationIssues,
    });
  } catch (error) {
    next(error);
  }
}
