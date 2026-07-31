import { JobsRepository } from '../../db/repositories/jobs.js';
import { ChunksRepository } from '../../db/repositories/chunks.js';
import { parseSRT } from '../srt/parse.js';
import { validateSource } from '../srt/validate.js';
import { chunkCues } from '../../utils/chunking.js';
import type { CreateJobRequest, TranslationJob } from '../../types/jobs.js';
import type { ValidationIssue } from '../../types/subtitles.js';

export type CreateJobResult = {
  job: TranslationJob;
  valid: boolean;
  /** Parse + validation issues discovered before translation. */
  preIssues: ValidationIssue[];
};

export async function createJob(req: CreateJobRequest): Promise<CreateJobResult> {
  // 1. Parse raw SRT text into structured cues
  const { cues, totalCues, parseErrors } = parseSRT(req.srtContent);

  // 2. Validate the source SRT. Parsing errors are structural — a file with
  //    malformed blocks must not pass as fully valid with silently dropped cues.
  const validation = validateSource(cues);
  const preIssues = [
    ...parseErrors,
    ...validation.errors,
    ...validation.warnings,
  ];
  const valid = parseErrors.length === 0 && validation.valid;

  // 3. Estimate chunks
  // Chunk size of 500 cues keeps a 1,800-cue movie file within 4 API requests,
  // well under the Gemini free-tier limit of 20 requests/day.
  // Gemini Flash's 1M-token context window handles large chunks without issue.
  const chunkedCues = chunkCues(cues, {
    maxCues: 500,
    maxChars: 60000,
    estimatedTokenBudget: 15000,
  });

  // 4. Create the DB record for the job
  const job = await JobsRepository.create({
    status: valid ? 'pending' : 'failed',
    sourceFilename: req.filename,
    targetLanguage: req.targetLanguage,
    model: req.model,
    toneStyle: req.toneStyle,
    glossary: req.glossary || null,
    totalCues,
    totalChunks: chunkedCues.length,
    processedChunks: 0,
    failedChunks: 0,
    errorMessage: valid ? null : 'Pre-translation validation failed.',
  });

  // 5. Store pre-validation report
  if (preIssues.length > 0) {
    await JobsRepository.addValidationReport(job.id, null, 'pre', preIssues);
  }

  // If the file was not structurally valid, don't create chunks to translate
  if (!valid) {
    return { job, valid: false, preIssues };
  }

  // 6. Create chunk records in the database (single bulk insert)
  await ChunksRepository.createMany(
    chunkedCues.map((chunkCuesList, i) => ({
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
    }))
  );

  return { job, valid: true, preIssues };
}
