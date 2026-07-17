import { eq, and, gt, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { translationChunks, translationJobs } from '../schema.js';
import type { TranslationChunk, ChunkStatus } from '../../types/jobs.js';
import type { TranslationItem } from '../../types/subtitles.js';

export class ChunksRepository {
  static async create(chunk: Omit<TranslationChunk, 'id'>): Promise<TranslationChunk> {
    const [inserted] = await db
      .insert(translationChunks)
      .values({
        jobId: chunk.jobId,
        chunkIndex: chunk.chunkIndex,
        status: chunk.status,
        retryCount: chunk.retryCount,
        cueIndexes: chunk.cueIndexes,
        cuesToTranslate: chunk.cuesToTranslate,
        translatedItems: chunk.translatedItems,
        errorMessage: chunk.errorMessage,
        startedAt: chunk.startedAt,
        completedAt: chunk.completedAt,
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to create chunk');
    }

    return inserted;
  }

  static async findById(id: string): Promise<TranslationChunk | null> {
    const [chunk] = await db
      .select()
      .from(translationChunks)
      .where(eq(translationChunks.id, id));

    return chunk || null;
  }

  static async findByJobId(jobId: string): Promise<TranslationChunk[]> {
    return db
      .select()
      .from(translationChunks)
      .where(eq(translationChunks.jobId, jobId))
      .orderBy(translationChunks.chunkIndex);
  }

  static async updateStatus(
    id: string,
    status: ChunkStatus,
    extra: Partial<Omit<TranslationChunk, 'id' | 'status'>> = {}
  ): Promise<TranslationChunk> {
    const [updated] = await db
      .update(translationChunks)
      .set({
        status,
        ...extra,
      })
      .where(eq(translationChunks.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Failed to update status for chunk ${id}`);
    }

    return updated;
  }

  static async updateSuccess(
    id: string,
    translatedItems: TranslationItem[]
  ): Promise<TranslationChunk> {
    return this.updateStatus(id, 'completed', {
      translatedItems,
      errorMessage: null,
      completedAt: new Date(),
    });
  }

  static async updateFailure(
    id: string,
    errorMessage: string,
    retryCount: number
  ): Promise<TranslationChunk> {
    return this.updateStatus(id, 'failed', {
      errorMessage,
      retryCount,
      completedAt: new Date(),
    });
  }

  static async splitChunk(
    chunkId: string,
    cuesA: any[],
    cuesB: any[]
  ): Promise<void> {
    const chunk = await this.findById(chunkId);
    if (!chunk) {
      throw new Error(`Chunk ${chunkId} not found for split`);
    }

    const job = await db
      .select()
      .from(translationJobs)
      .where(eq(translationJobs.id, chunk.jobId))
      .then((rows) => rows[0] || null);

    if (!job) {
      throw new Error(`Job ${chunk.jobId} not found for split`);
    }

    await db.transaction(async (tx) => {
      // 1. Shift indices of subsequent chunks for this job
      await tx
        .update(translationChunks)
        .set({ chunkIndex: sql`chunk_index + 1` })
        .where(
          and(
            eq(translationChunks.jobId, chunk.jobId),
            gt(translationChunks.chunkIndex, chunk.chunkIndex)
          )
        );

      // 2. Delete original failed chunk
      await tx.delete(translationChunks).where(eq(translationChunks.id, chunkId));

      // 3. Insert new chunk A (same index)
      await tx.insert(translationChunks).values({
        jobId: chunk.jobId,
        chunkIndex: chunk.chunkIndex,
        status: 'pending',
        retryCount: 0,
        cueIndexes: cuesA.map((c) => c.index),
        cuesToTranslate: cuesA,
        errorMessage: null,
      });

      // 4. Insert new chunk B (index + 1)
      await tx.insert(translationChunks).values({
        jobId: chunk.jobId,
        chunkIndex: chunk.chunkIndex + 1,
        status: 'pending',
        retryCount: 0,
        cueIndexes: cuesB.map((c) => c.index),
        cuesToTranslate: cuesB,
        errorMessage: null,
      });

      // 5. Update job metrics:
      // totalChunks increases by 1
      // processedChunks reduces by 1 (since the failed chunk was deleted and replaced with pending ones)
      // failedChunks reduces by 1 (since the failure was replaced with two pending chunks)
      await tx
        .update(translationJobs)
        .set({
          totalChunks: job.totalChunks + 1,
          processedChunks: Math.max(0, job.processedChunks - 1),
          failedChunks: Math.max(0, job.failedChunks - 1),
          status: 'translating',
          updatedAt: new Date(),
        })
        .where(eq(translationJobs.id, chunk.jobId));
    });
  }
}
