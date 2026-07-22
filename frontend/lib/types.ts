export type SubtitleCue = {
  index: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  textLines: string[];
};

export type TranslationItem = {
  index: number;
  translatedLines: string[];
};

export type ValidationSeverity = 'error' | 'warning';

export type ValidationIssue = {
  severity: ValidationSeverity;
  cueIndex: number | null;
  code: string;
  message: string;
};

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
  createdAt: string;
  updatedAt: string;
  errorMessage: string | null;
};

export type TranslationChunk = {
  id: string;
  jobId: string;
  chunkIndex: number;
  status: ChunkStatus;
  retryCount: number;
  cueIndexes: number[];
  cuesToTranslate: SubtitleCue[];
  translatedItems: TranslationItem[] | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  usedProjectLabel?: string | null;
};

export type JobDetails = TranslationJob & {
  chunks: TranslationChunk[];
  validationIssues: ValidationIssue[];
};
