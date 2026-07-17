import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { exports } from '../schema.js';
import type { ExportRecord } from '../../types/jobs.js';

export class ExportsRepository {
  static async create(exportRecord: Omit<ExportRecord, 'id' | 'createdAt'>): Promise<ExportRecord> {
    const [inserted] = await db
      .insert(exports)
      .values({
        jobId: exportRecord.jobId,
        filename: exportRecord.filename,
        content: exportRecord.content,
      })
      .returning();

    if (!inserted) {
      throw new Error('Failed to create export record');
    }

    return inserted;
  }

  static async findByJobId(jobId: string): Promise<ExportRecord | null> {
    const [record] = await db
      .select()
      .from(exports)
      .where(eq(exports.jobId, jobId));

    return record || null;
  }
}
