export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { ChunksRepository } from '@/lib/server/db/repositories/chunks';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing job id' } }, { status: 400 });
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      return NextResponse.json({ error: { message: 'Job not found' } }, { status: 404 });
    }

    const chunks = await ChunksRepository.findByJobId(id);
    const validationIssues = await JobsRepository.getValidationIssues(id);

    return NextResponse.json({
      job: {
        ...job,
        chunks: chunks.map((c) => ({
          id: c.id,
          chunkIndex: c.chunkIndex,
          status: c.status,
          retryCount: c.retryCount,
          cueIndexes: c.cueIndexes,
          cuesToTranslate: c.cuesToTranslate,
          translatedItems: c.translatedItems,
          errorMessage: c.errorMessage,
          startedAt: c.startedAt,
          completedAt: c.completedAt,
        })),
        validationIssues,
      },
    });
  } catch (error: any) {
    console.error('[API GetJob Error]', error);
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to fetch job' } },
      { status: 500 }
    );
  }
}
