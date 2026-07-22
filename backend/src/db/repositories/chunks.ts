import { FieldValue, FieldPath } from 'firebase-admin/firestore';
import { db } from '../firebase.js';
import type { TranslationChunk, ChunkStatus } from '../../types/jobs.js';
import type { TranslationItem, SubtitleCue } from '../../types/subtitles.js';

// Helper: convert a Firestore document snapshot to a TranslationChunk
function docToChunk(id: string, data: FirebaseFirestore.DocumentData): TranslationChunk {
  return {
    id,
    jobId: data['jobId'],
    chunkIndex: data['chunkIndex'],
    status: data['status'],
    retryCount: data['retryCount'] ?? 0,
    cueIndexes: data['cueIndexes'] ?? [],
    cuesToTranslate: data['cuesToTranslate'] ?? [],
    translatedItems: data['translatedItems'] ?? null,
    errorMessage: data['errorMessage'] ?? null,
    startedAt: data['startedAt']?.toDate() ?? null,
    completedAt: data['completedAt']?.toDate() ?? null,
    usedProjectLabel: data['usedProjectLabel'] ?? null,
  };
}

export class ChunksRepository {
  static async create(chunk: Omit<TranslationChunk, 'id'>): Promise<TranslationChunk> {
    const docRef = await db
      .collection('jobs')
      .doc(chunk.jobId)
      .collection('chunks')
      .add({
        jobId: chunk.jobId,
        chunkIndex: chunk.chunkIndex,
        status: chunk.status,
        retryCount: chunk.retryCount,
        cueIndexes: chunk.cueIndexes,
        cuesToTranslate: chunk.cuesToTranslate,
        translatedItems: chunk.translatedItems ?? null,
        errorMessage: chunk.errorMessage ?? null,
        startedAt: chunk.startedAt ?? null,
        completedAt: chunk.completedAt ?? null,
        usedProjectLabel: chunk.usedProjectLabel ?? null,
      });

    const snap = await docRef.get();
    return docToChunk(docRef.id, snap.data()!);
  }

  static async findById(id: string): Promise<TranslationChunk | null> {
    // Use a collectionGroup query with FieldPath.documentId() to find the chunk across all job subcollections
    const groupSnap = await db
      .collectionGroup('chunks')
      .where(FieldPath.documentId(), '==', id)
      .limit(1)
      .get();

    if (groupSnap.empty) return null;
    const doc = groupSnap.docs[0]!;
    return docToChunk(doc.id, doc.data());
  }

  static async findByJobId(jobId: string): Promise<TranslationChunk[]> {
    const snap = await db
      .collection('jobs')
      .doc(jobId)
      .collection('chunks')
      .orderBy('chunkIndex')
      .get();

    return snap.docs.map((doc) => docToChunk(doc.id, doc.data()));
  }

  static async updateStatus(
    id: string,
    status: ChunkStatus,
    extra: Partial<Omit<TranslationChunk, 'id' | 'status'>> = {}
  ): Promise<TranslationChunk> {
    // We need the jobId to address the subcollection. Use collectionGroup to find the doc.
    const groupSnap = await db
      .collectionGroup('chunks')
      .where(FieldPath.documentId(), '==', id)
      .limit(1)
      .get();

    if (groupSnap.empty) throw new Error(`Chunk ${id} not found`);
    const doc = groupSnap.docs[0]!;

    const updatePayload: Record<string, unknown> = { status };
    if (extra.retryCount !== undefined) updatePayload['retryCount'] = extra.retryCount;
    if (extra.errorMessage !== undefined) updatePayload['errorMessage'] = extra.errorMessage;
    if (extra.translatedItems !== undefined) updatePayload['translatedItems'] = extra.translatedItems;
    if (extra.startedAt !== undefined) updatePayload['startedAt'] = extra.startedAt;
    if (extra.completedAt !== undefined) updatePayload['completedAt'] = extra.completedAt;
    if (extra.usedProjectLabel !== undefined) updatePayload['usedProjectLabel'] = extra.usedProjectLabel;

    await doc.ref.update(updatePayload);
    const updated = await doc.ref.get();
    return docToChunk(updated.id, updated.data()!);
  }

  static async updateSuccess(
    id: string,
    translatedItems: TranslationItem[],
    usedProjectLabel: string
  ): Promise<TranslationChunk> {
    return this.updateStatus(id, 'completed', {
      translatedItems,
      errorMessage: null,
      completedAt: new Date(),
      usedProjectLabel,
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
    // Find the original chunk
    const groupSnap = await db
      .collectionGroup('chunks')
      .where(FieldPath.documentId(), '==', chunkId)
      .limit(1)
      .get();

    if (groupSnap.empty) throw new Error(`Chunk ${chunkId} not found for split`);
    const originalDoc = groupSnap.docs[0]!;
    const originalData = originalDoc.data();
    const jobId: string = originalData['jobId'];
    const chunkIndex: number = originalData['chunkIndex'];

    const jobRef = db.collection('jobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) throw new Error(`Job ${jobId} not found for split`);

    const jobData = jobSnap.data()!;
    const chunksRef = db.collection('jobs').doc(jobId).collection('chunks');

    // Use a batch write — analogous to a SQL transaction for this multi-step atomic operation:
    // 1. Delete original chunk
    // 2. Insert chunk A (same index)
    // 3. Insert chunk B (index + 1)
    // 4. Shift all chunks with index > chunkIndex by +1 (done outside batch as batch can't query)
    // 5. Update job counters

    // Step 1: Shift subsequent chunk indexes (must be done before the batch)
    const subsequentSnap = await chunksRef
      .where('chunkIndex', '>', chunkIndex)
      .get();

    const batch = db.batch();

    // Shift subsequent chunks
    for (const doc of subsequentSnap.docs) {
      batch.update(doc.ref, { chunkIndex: (doc.data()['chunkIndex'] as number) + 1 });
    }

    // Delete original failed chunk
    batch.delete(originalDoc.ref);

    // Insert chunk A (same index)
    const chunkARef = chunksRef.doc();
    batch.set(chunkARef, {
      jobId,
      chunkIndex,
      status: 'pending',
      retryCount: 0,
      cueIndexes: cuesA.map((c) => c.index),
      cuesToTranslate: cuesA,
      translatedItems: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      usedProjectLabel: null,
    });

    // Insert chunk B (index + 1)
    const chunkBRef = chunksRef.doc();
    batch.set(chunkBRef, {
      jobId,
      chunkIndex: chunkIndex + 1,
      status: 'pending',
      retryCount: 0,
      cueIndexes: cuesB.map((c) => c.index),
      cuesToTranslate: cuesB,
      translatedItems: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      usedProjectLabel: null,
    });

    // Update job metrics
    batch.update(jobRef, {
      totalChunks: jobData['totalChunks'] + 1,
      processedChunks: Math.max(0, jobData['processedChunks'] - 1),
      failedChunks: Math.max(0, jobData['failedChunks'] - 1),
      status: 'translating',
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }
}
