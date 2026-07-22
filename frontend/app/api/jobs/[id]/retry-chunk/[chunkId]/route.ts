export const dynamic = 'force-dynamic';

import { NextResponse, after } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { ChunksRepository } from '@/lib/server/db/repositories/chunks';
import { processChunk } from '@/lib/server/services/jobs/processChunk';
import { rebuildOutput } from '@/lib/server/services/jobs/rebuildOutput';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; chunkId: string }> }
) {
  try {
    const { id, chunkId } = await params;
    if (!id || !chunkId) {
      return NextResponse.json({ error: { message: 'Missing job id or chunk id' } }, { status: 400 });
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      return NextResponse.json({ error: { message: 'Job not found' } }, { status: 404 });
    }

    const chunk = await ChunksRepository.findById(chunkId);
    if (!chunk || chunk.jobId !== id) {
      return NextResponse.json({ error: { message: 'Chunk not found in this job' } }, { status: 404 });
    }

    after(async () => {
      try {
        await JobsRepository.updateStatus(id, 'translating');
        await processChunk(chunkId);

        const chunks = await ChunksRepository.findByJobId(id);
        const allCompleted = chunks.every((c) => c.status === 'completed');

        if (allCompleted) {
          await JobsRepository.updateStatus(id, 'rebuilding');
          await rebuildOutput(id);
          await JobsRepository.updateStatus(id, 'completed');
        } else if (chunks.every((c) => c.status !== 'processing' && c.status !== 'pending')) {
          await JobsRepository.updateStatus(id, 'failed', {
            errorMessage: 'Some subtitle chunks are still in a failed state.',
          });
        }
      } catch (err) {
        console.error(`[RetryChunk BG Error] Failed retrying chunk ${chunkId}:`, err);
      }
    });

    return NextResponse.json({ message: 'Chunk retry started.' }, { status: 202 });
  } catch (error: any) {
    console.error('[API RetryChunk Error]', error);
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to retry chunk' } },
      { status: 500 }
    );
  }
}
