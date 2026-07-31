import { eq, and, sql } from 'drizzle-orm';
import { db } from '../client.js';
import { translationChunks, translationJobs } from '../schema.js';
import type { TranslationChunk, ChunkStatus } from '../../types/jobs.js';
import type { SubtitleCue, TranslationItem } from '../../types/subtitles.js';

export type ClaimResult = {
  chunk: TranslationChunk;
  /** True when the chunk was previously failed and had already been counted in job metrics. */
  wasFailed: boolean;
};

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

  static async createMany(
    chunks: Omit<TranslationChunk, 'id'>[]
  ): Promise<TranslationChunk[]> {
    if (chunks.length === 0) return [];
    return db.insert(translationChunks).values(chunks).returning();
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

  /**
   * Atomically claim a chunk for translation.
   *
   * Only chunks in `pending` or `failed` can be claimed. When a previously
   * failed chunk is claimed, its already-counted outcome is reverted from the
   * job metrics so retries never double-count.
   *
   * Returns `null` if the chunk cannot be claimed (already processing or
   * completed) — callers should treat this as an idempotent no-op.
   */
  static async claimForProcessing(id: string): Promise<ClaimResult | null> {
    return db.transaction(async (tx) => {
      const [chunk] = await tx
        .select()
        .from(translationChunks)
        .where(eq(translationChunks.id, id))
        .for('update');

      if (!chunk) return null;
      if (chunk.status !== 'pending' && chunk.status !== 'failed') return null;

      const wasFailed = chunk.status === 'failed';

      await tx
        .update(translationChunks)
        .set({ status: 'processing', startedAt: new Date() })
        .where(eq(translationChunks.id, id));

      if (wasFailed) {
        await tx
          .update(translationJobs)
          .set({
            processedChunks: sql`greatest(${translationJobs.processedChunks} - 1, 0)`,
            failedChunks: sql`greatest(${translationJobs.failedChunks} - 1, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(translationJobs.id, chunk.jobId));
      }

      return { chunk, wasFailed };
    });
  }

  /**
   * Atomically record a successful translation. Guards on the chunk still being
   * `processing` so a stale/double call never double-counts the outcome.
   */
  static async markCompleted(
    id: string,
    jobId: string,
    translatedItems: TranslationItem[]
  ): Promise<TranslationChunk | null> {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(translationChunks)
        .set({
          status: 'completed',
          translatedItems,
          errorMessage: null,
          completedAt: new Date(),
        })
        .where(and(eq(translationChunks.id, id), eq(translationChunks.status, 'processing')))
        .returning();

      if (!updated) return null;

      await tx
        .update(translationJobs)
        .set({
          processedChunks: sql`${translationJobs.processedChunks} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(translationJobs.id, jobId));

      return updated;
    });
  }

  /**
   * Atomically record a failed translation. Guards on the chunk still being
   * `processing` so a stale/double call never double-counts the outcome.
   */
  static async markFailed(
    id: string,
    jobId: string,
    errorMessage: string,
    retryCount: number
  ): Promise<TranslationChunk | null> {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(translationChunks)
        .set({
          status: 'failed',
          errorMessage,
          retryCount,
          completedAt: new Date(),
        })
        .where(and(eq(translationChunks.id, id), eq(translationChunks.status, 'processing')))
        .returning();

      if (!updated) return null;

      await tx
        .update(translationJobs)
        .set({
          processedChunks: sql`${translationJobs.processedChunks} + 1`,
          failedChunks: sql`${translationJobs.failedChunks} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(translationJobs.id, jobId));

      return updated;
    });
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
    cuesA: SubtitleCue[],
    cuesB: SubtitleCue[]
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
            sql`${translationChunks.chunkIndex} > ${chunk.chunkIndex}`
          )
        );

      // 2. Delete original chunk (claimed chunks are not counted in metrics,
      //    so only totalChunks needs to increase)
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

      // 5. Update job metrics: only totalChunks grows (+1 for the split)
      await tx
        .update(translationJobs)
        .set({
          totalChunks: sql`${translationJobs.totalChunks} + 1`,
          status: 'translating',
          updatedAt: new Date(),
        })
        .where(eq(translationJobs.id, chunk.jobId));
    });
  }
}
