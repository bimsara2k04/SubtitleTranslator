import { pgTable, uuid, text, varchar, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';

// Locally declared types to prevent CommonJS/ESM import errors during Drizzle Kit migration

type SubtitleCue = {
  index: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  textLines: string[];
};

type TranslationItem = {
  index: number;
  translatedLines: string[];
};

type ValidationIssue = {
  severity: 'error' | 'warning';
  cueIndex: number | null;
  code: string;
  message: string;
};

type JobStatus =
  | 'pending'
  | 'parsing'
  | 'translating'
  | 'rebuilding'
  | 'completed'
  | 'failed';

type ChunkStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export const translationJobs = pgTable('translation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 50 }).$type<JobStatus>().notNull().default('pending'),
  sourceFilename: varchar('source_filename', { length: 255 }).notNull(),
  targetLanguage: varchar('target_language', { length: 100 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  toneStyle: varchar('tone_style', { length: 50 }).notNull().default('natural'),
  glossary: text('glossary'),
  totalCues: integer('total_cues').notNull().default(0),
  totalChunks: integer('total_chunks').notNull().default(0),
  processedChunks: integer('processed_chunks').notNull().default(0),
  failedChunks: integer('failed_chunks').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  errorMessage: text('error_message'),
});

export const translationChunks = pgTable('translation_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => translationJobs.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  status: varchar('status', { length: 50 }).$type<ChunkStatus>().notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  cueIndexes: jsonb('cue_indexes').$type<number[]>().notNull(),
  cuesToTranslate: jsonb('cues_to_translate').$type<SubtitleCue[]>().notNull(),
  translatedItems: jsonb('translated_items').$type<TranslationItem[]>(),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const validationReports = pgTable('validation_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => translationJobs.id, { onDelete: 'cascade' }),
  chunkId: uuid('chunk_id').references(() => translationChunks.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 10 }).$type<'pre' | 'post'>().notNull(),
  issues: jsonb('issues').$type<ValidationIssue[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const exports = pgTable('exports', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => translationJobs.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
