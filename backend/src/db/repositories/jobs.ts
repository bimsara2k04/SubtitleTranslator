import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { translationJobs, validationReports } from '../schema.js';
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

  static async incrementProcessed(id: string, isFailed = false): Promise<TranslationJob> {
    const job = await this.findById(id);
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }

    const processedChunks = job.processedChunks + 1;
    const failedChunks = isFailed ? job.failedChunks + 1 : job.failedChunks;
    
    // Check if we are finished
    let status = job.status;
    if (processedChunks >= job.totalChunks) {
      status = failedChunks > 0 ? 'failed' : 'completed';
    }

    const [updated] = await db
      .update(translationJobs)
      .set({
        processedChunks,
        failedChunks,
        status,
        updatedAt: new Date(),
      })
      .where(eq(translationJobs.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update progress for job ${id}`);
    }

    return updated;
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
}
