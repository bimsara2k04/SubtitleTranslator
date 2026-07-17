import { JobsRepository } from '../../db/repositories/jobs.js';
import { ChunksRepository } from '../../db/repositories/chunks.js';
import { parseSRT } from '../srt/parse.js';
import { validateSource } from '../srt/validate.js';
import { chunkCues } from '../../utils/chunking.js';
import type { CreateJobRequest, TranslationJob } from '../../types/jobs.js';

export type CreateJobResult = {
  job: TranslationJob;
  valid: boolean;
};

export async function createJob(req: CreateJobRequest): Promise<CreateJobResult> {
  // 1. Parse raw SRT text into structured cues
  const { cues, totalCues } = parseSRT(req.srtContent);

  // 2. Validate the source SRT
  const validation = validateSource(cues);

  // 3. Estimate chunks
  const chunkedCues = chunkCues(cues, {
    maxCues: 80,
    maxChars: 8000,
    estimatedTokenBudget: 2000,
  });

  // 4. Create the DB record for the job
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
    errorMessage: validation.valid ? null : 'Pre-translation validation failed.',
  });

  // 5. Store pre-validation report
  const preIssues = [...validation.errors, ...validation.warnings];
  if (preIssues.length > 0) {
    await JobsRepository.addValidationReport(job.id, null, 'pre', preIssues);
  }

  // If the file was not structurally valid, don't create chunks to translate
  if (!validation.valid) {
    return { job, valid: false };
  }

  // 6. Create chunk records in the database
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
    });
  }

  return { job, valid: true };
}
