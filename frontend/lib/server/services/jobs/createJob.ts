import { JobsRepository } from '../../db/repositories/jobs';
import { ChunksRepository } from '../../db/repositories/chunks';
import { parseSRT } from '../srt/parse';
import { validateSource } from '../srt/validate';
import { chunkCues } from '../../utils/chunking';
import type { CreateJobRequest, TranslationJob } from '../../types/jobs';

export type CreateJobResult = {
  job: TranslationJob;
  valid: boolean;
};

export async function createJob(req: CreateJobRequest): Promise<CreateJobResult> {
  const { cues, totalCues } = parseSRT(req.srtContent);
  const validation = validateSource(cues);

  const chunkedCues = chunkCues(cues, {
    maxCues: 500,
    maxChars: 60000,
    estimatedTokenBudget: 15000,
  });

  const job = await JobsRepository.create({
    status: validation.valid ? 'pending' : 'failed',
    sourceFilename: req.filename,
    targetLanguage: req.targetLanguage,
    model: req.model,
    toneStyle: req.toneStyle,
    glossary: req.glossary || null,
    totalCues,
    totalChunks: chunkedCues.length,
    processedChunks: 0,
    failedChunks: 0,
    userId: req.userId,
    errorMessage: validation.valid ? null : 'Pre-translation validation failed.',
  });

  const preIssues = [...validation.errors, ...validation.warnings];
  if (preIssues.length > 0) {
    await JobsRepository.addValidationReport(job.id, null, 'pre', preIssues);
  }

  if (!validation.valid) {
    return { job, valid: false };
  }

  for (let i = 0; i < chunkedCues.length; i++) {
    const chunkCuesList = chunkedCues[i];
    if (!chunkCuesList) continue;

    await ChunksRepository.create({
      jobId: job.id,
      chunkIndex: i,
      status: 'pending',
      retryCount: 0,
      cueIndexes: chunkCuesList.map((c) => c.index),
      cuesToTranslate: chunkCuesList,
      translatedItems: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      usedProjectLabel: null,
    });
  }

  return { job, valid: true };
}
