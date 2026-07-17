// Plain ESM JS re-export for drizzle-kit consumption (no TypeScript compilation needed)
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const translationJobs = pgTable('translation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
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
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  retryCount: integer('retry_count').notNull().default(0),
  cueIndexes: jsonb('cue_indexes').notNull(),
  cuesToTranslate: jsonb('cues_to_translate').notNull(),
  translatedItems: jsonb('translated_items'),
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
  type: varchar('type', { length: 10 }).notNull(),
  issues: jsonb('issues').notNull(),
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
