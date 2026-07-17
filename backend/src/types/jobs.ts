import type { ValidationIssue } from './subtitles.js';

export type JobStatus =
  | 'pending'
  | 'parsing'
  | 'translating'
  | 'rebuilding'
  | 'completed'
  | 'failed';

export type ChunkStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export type TranslationJob = {
  id: string;
  status: JobStatus;
  sourceFilename: string;
  targetLanguage: string;
  model: string;
  toneStyle: string;
  glossary: string | null;
  totalCues: number;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  createdAt: Date;
  updatedAt: Date;
  errorMessage: string | null;
};

export type TranslationChunk = {
  id: string;
  jobId: string;
  chunkIndex: number;
  status: ChunkStatus;
  retryCount: number;
  cueIndexes: number[];
  cuesToTranslate: import('./subtitles.js').SubtitleCue[];
  translatedItems: import('./subtitles.js').TranslationItem[] | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type ValidationReport = {
  id: string;
  jobId: string;
  chunkId: string | null;
  type: 'pre' | 'post';
  issues: ValidationIssue[];
  createdAt: Date;
};

export type ExportRecord = {
  id: string;
  jobId: string;
  filename: string;
  content: string;
  createdAt: Date;
};

export type CreateJobRequest = {
  filename: string;
  targetLanguage: string;
  model: string;
  toneStyle: string;
  glossary?: string;
  srtContent: string;
};

export type JobWithChunks = TranslationJob & {
  chunks: TranslationChunk[];
  validationIssues: ValidationIssue[];
};
