import type { Request, Response, NextFunction } from 'express';
import { createJob } from '../services/jobs/createJob.js';
import { JobsRepository } from '../db/repositories/jobs.js';
import { looksLikeSRT } from '../services/srt/parse.js';

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

    const { targetLanguage, model, toneStyle, glossary } = req.body;
    if (!targetLanguage) {
      res.status(400).json({ error: { code: 'MISSING_PARAM', message: 'targetLanguage is required.' } });
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
      filename: file.originalname,
      targetLanguage,
      model: model || 'gemini-2.0-flash',
      toneStyle: toneStyle || 'natural',
      glossary: glossary || '',
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
