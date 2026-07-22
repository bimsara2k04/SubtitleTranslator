import { FieldValue } from 'firebase-admin/firestore';
import { adminDb as db } from '../../firebaseAdmin';
import type { TranslationJob, JobStatus } from '../../types/jobs';
import type { ValidationIssue } from '../../types/subtitles';

function docToJob(id: string, data: FirebaseFirestore.DocumentData): TranslationJob {
  return {
    id,
    status: data['status'],
    sourceFilename: data['sourceFilename'],
    targetLanguage: data['targetLanguage'],
    model: data['model'],
    toneStyle: data['toneStyle'],
    glossary: data['glossary'] ?? null,
    totalCues: data['totalCues'],
    totalChunks: data['totalChunks'],
    processedChunks: data['processedChunks'],
    failedChunks: data['failedChunks'],
    userId: data['userId'] ?? null,
    createdAt: data['createdAt']?.toDate() ?? new Date(),
    updatedAt: data['updatedAt']?.toDate() ?? new Date(),
    errorMessage: data['errorMessage'] ?? null,
  };
}

export class JobsRepository {
  static async create(job: Omit<TranslationJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<TranslationJob> {
    const now = FieldValue.serverTimestamp();
    const docRef = await db.collection('jobs').add({
      status: job.status,
      sourceFilename: job.sourceFilename,
      targetLanguage: job.targetLanguage,
      model: job.model,
      toneStyle: job.toneStyle,
      glossary: job.glossary ?? null,
      totalCues: job.totalCues,
      totalChunks: job.totalChunks,
      processedChunks: job.processedChunks,
      failedChunks: job.failedChunks,
      userId: job.userId ?? null,
      errorMessage: job.errorMessage ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const snap = await docRef.get();
    return docToJob(docRef.id, snap.data()!);
  }

  static async findByUserId(userId: string): Promise<TranslationJob[]> {
    const snap = await db
      .collection('jobs')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map((doc) => docToJob(doc.id, doc.data()));
  }

  static async findById(id: string): Promise<TranslationJob | null> {
    const snap = await db.collection('jobs').doc(id).get();
    if (!snap.exists) return null;
    return docToJob(snap.id, snap.data()!);
  }

  static async updateStatus(
    id: string,
    status: JobStatus,
    extra: Partial<Omit<TranslationJob, 'id' | 'status' | 'createdAt' | 'updatedAt'>> = {}
  ): Promise<TranslationJob> {
    const ref = db.collection('jobs').doc(id);
    await ref.update({
      status,
      updatedAt: FieldValue.serverTimestamp(),
      ...extra,
    });

    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Failed to update status for job ${id}`);
    return docToJob(snap.id, snap.data()!);
  }

  static async incrementProcessed(id: string, isFailed = false): Promise<TranslationJob> {
    const ref = db.collection('jobs').doc(id);

    const updated = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`Job ${id} not found`);

      const data = snap.data()!;
      const processedChunks: number = data['processedChunks'] + 1;
      const failedChunks: number = isFailed ? data['failedChunks'] + 1 : data['failedChunks'];
      const totalChunks: number = data['totalChunks'];

      let status: JobStatus = data['status'];
      if (processedChunks >= totalChunks) {
        status = failedChunks > 0 ? 'failed' : 'completed';
      }

      tx.update(ref, {
        processedChunks,
        failedChunks,
        status,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        ...data,
        id: snap.id,
        processedChunks,
        failedChunks,
        status,
        createdAt: data['createdAt']?.toDate() ?? new Date(),
        updatedAt: new Date(),
        glossary: data['glossary'] ?? null,
        errorMessage: data['errorMessage'] ?? null,
      } as TranslationJob;
    });

    return updated;
  }

  static async addValidationReport(
    jobId: string,
    chunkId: string | null,
    type: 'pre' | 'post',
    issues: ValidationIssue[]
  ) {
    const ref = await db
      .collection('jobs')
      .doc(jobId)
      .collection('validationReports')
      .add({
        jobId,
        chunkId: chunkId ?? null,
        type,
        issues,
        createdAt: FieldValue.serverTimestamp(),
      });
    return { id: ref.id, jobId, chunkId, type, issues, createdAt: new Date() };
  }

  static async getValidationIssues(jobId: string): Promise<ValidationIssue[]> {
    const snap = await db
      .collection('jobs')
      .doc(jobId)
      .collection('validationReports')
      .get();

    const issues: ValidationIssue[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (Array.isArray(data['issues'])) {
        issues.push(...(data['issues'] as ValidationIssue[]));
      }
    }
    return issues;
  }
}
