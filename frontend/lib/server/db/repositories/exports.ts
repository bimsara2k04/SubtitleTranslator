import { FieldValue } from 'firebase-admin/firestore';
import { adminDb as db } from '../../firebaseAdmin';
import type { ExportRecord } from '../../types/jobs';

function docToExport(id: string, data: FirebaseFirestore.DocumentData): ExportRecord {
  return {
    id,
    jobId: data['jobId'],
    filename: data['filename'],
    content: data['content'],
    createdAt: data['createdAt']?.toDate() ?? new Date(),
  };
}

export class ExportsRepository {
  static async create(exportRecord: Omit<ExportRecord, 'id' | 'createdAt'>): Promise<ExportRecord> {
    const docRef = await db
      .collection('jobs')
      .doc(exportRecord.jobId)
      .collection('exports')
      .add({
        jobId: exportRecord.jobId,
        filename: exportRecord.filename,
        content: exportRecord.content,
        createdAt: FieldValue.serverTimestamp(),
      });

    const snap = await docRef.get();
    return docToExport(docRef.id, snap.data()!);
  }

  static async findByJobId(jobId: string): Promise<ExportRecord | null> {
    const snap = await db
      .collection('jobs')
      .doc(jobId)
      .collection('exports')
      .limit(1)
      .get();

    if (snap.empty) return null;
    const doc = snap.docs[0]!;
    return docToExport(doc.id, doc.data());
  }
}
