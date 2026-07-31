import { eq, and, sql, inArray } from 'drizzle-orm';
import { db } from '../client.js';
import { translationJobs, translationChunks, validationReports } from '../schema.js';
import type { TranslationJob, JobStatus } from '../../types/jobs.js';
import type { ValidationIssue } from '../../types/subtitles.js';

export class JobsRepository {
  static async create(job: Omit<TranslationJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<TranslationJob> {
    const [inserted] = await db
      .insert(translationJobs)
      .values({
        status: job.status,
        sourceFilename: job.sourceFilename,
        targetLanguage: job.targetLanguage,
        model: job.model,
        toneStyle: job.toneStyle,
        glossary: job.glossary,
        totalCues: job.totalCues,
        totalChunks: job.totalChunks,
        processedChunks: job.processedChunks,
        failedChunks: job.failedChunks,
        errorMessage: job.errorMessage,
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to create job');
    }

    return inserted;
  }

  static async findById(id: string): Promise<TranslationJob | null> {
    const [job] = await db
      .select()
      .from(translationJobs)
      .where(eq(translationJobs.id, id));

    return job || null;
  }

  static async updateStatus(
    id: string,
    status: JobStatus,
    extra: Partial<Omit<TranslationJob, 'id' | 'status' | 'createdAt' | 'updatedAt'>> = {}
  ): Promise<TranslationJob> {
    const [updated] = await db
      .update(translationJobs)
      .set({
        status,
        updatedAt: new Date(),
        ...extra,
      })
      .where(eq(translationJobs.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update status for job ${id}`);
    }

    return updated;
  }

  /**
   * Atomically claim a job for the background worker.
   *
   * Only jobs in `pending`, `failed`, or `completed` can be claimed. Two
   * concurrent `/translate` or `/retry-chunk` calls race on this UPDATE and
   * exactly one wins, preventing duplicate background workers per job.
   */
  static async claimForTranslation(id: string): Promise<boolean> {
    const result = await db
      .update(translationJobs)
      .set({ status: 'translating', updatedAt: new Date() })
      .where(
        and(
          eq(translationJobs.id, id),
          inArray(translationJobs.status, ['pending', 'failed', 'completed'])
        )
      );

    return (result.rowCount ?? 0) > 0;
  }

  static async addValidationReport(
    jobId: string,
    chunkId: string | null,
    type: 'pre' | 'post',
    issues: ValidationIssue[]
  ) {
    const [report] = await db
      .insert(validationReports)
      .values({
        jobId,
        chunkId,
        type,
        issues,
      })
      .returning();
    return report;
  }

  static async getValidationIssues(jobId: string): Promise<ValidationIssue[]> {
    const reports = await db
      .select()
      .from(validationReports)
      .where(eq(validationReports.jobId, jobId));

    return reports.flatMap((r) => r.issues);
  }

  /**
   * Recover jobs that were left mid-flight by a crash or restart.
   * - Chunks stuck in `processing` older than the lease are reset to `pending`.
   * - Jobs stuck in `translating`/`rebuilding` older than the lease are marked
   *   `failed` so the user can retry them.
   * Run once at server startup.
   */
  static async recoverStaleJobs(leaseMs = 10 * 60 * 1000): Promise<void> {
    const staleBefore = new Date(Date.now() - leaseMs);

    await db
      .update(translationChunks)
      .set({ status: 'pending', errorMessage: null, completedAt: null })
      .where(
        and(
          eq(translationChunks.status, 'processing'),
          sql`${translationChunks.startedAt} IS NOT NULL AND ${translationChunks.startedAt} < ${staleBefore}`
        )
      );

    await db
      .update(translationJobs)
      .set({
        status: 'failed',
        errorMessage:
          'Translation was interrupted (server restarted). Press "Restart Translation" to resume.',
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(translationJobs.status, ['translating', 'rebuilding']),
          sql`${translationJobs.updatedAt} < ${staleBefore}`
        )
      );
  }
}
