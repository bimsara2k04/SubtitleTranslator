export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { ChunksRepository } from '@/lib/server/db/repositories/chunks';
import { processChunk } from '@/lib/server/services/jobs/processChunk';
import { rebuildOutput } from '@/lib/server/services/jobs/rebuildOutput';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    if (!id) {
      return NextResponse.json({ error: { message: 'Missing job id' } }, { status: 400 });
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      return NextResponse.json({ error: { message: 'Job not found' } }, { status: 404 });
    }

    // Set status to translating if it was pending or failed
    if (job.status !== 'translating') {
      await JobsRepository.updateStatus(id, 'translating');
    }

    // Find the first pending or failed chunk to process
    const currentChunks = await ChunksRepository.findByJobId(id);
    const nextChunk = currentChunks.find(
      (c) => c.status === 'pending' || c.status === 'failed'
    );

    if (nextChunk) {
      try {
        console.log(`[Translate API] Processing chunk ${nextChunk.id} (index ${nextChunk.chunkIndex}) synchronously`);
        await processChunk(id, nextChunk.id);
      } catch (err: any) {
        const msg = err?.message || String(err);
        console.warn(`[Translate API] Chunk ${nextChunk.id} failed or was split during sync execution:`, msg);
        
        // If it's a quota exhaust error, bubble it up
        if (msg.includes('daily free-tier quota exhausted') || msg.includes('PerDayPerProjectPerModel-FreeTier')) {
          await JobsRepository.updateStatus(id, 'failed', { errorMessage: msg });
          return NextResponse.json({ error: { message: msg } }, { status: 429 });
        }
      }
    }

    // After attempting to process, get the latest chunk states
    const updatedChunks = await ChunksRepository.findByJobId(id);
    const allCompleted = updatedChunks.every((c) => c.status === 'completed');
    const anyFailed = updatedChunks.some((c) => c.status === 'failed');
    const hasRemaining = updatedChunks.some((c) => c.status === 'pending' || c.status === 'failed');

    if (allCompleted) {
      await JobsRepository.updateStatus(id, 'rebuilding');
      await rebuildOutput(id);
      await JobsRepository.updateStatus(id, 'completed');
      return NextResponse.json({ message: 'Job completed.', status: 'completed' });
    } else if (!hasRemaining && anyFailed) {
      // If there are no pending chunks and some failed (without split), mark job as failed
      await JobsRepository.updateStatus(id, 'failed', {
        errorMessage: 'Some subtitle chunks failed to translate.',
      });
      return NextResponse.json({ message: 'Job failed.', status: 'failed' });
    }

    return NextResponse.json({
      message: 'Chunk step processed.',
      status: 'translating',
      processedChunks: updatedChunks.filter(c => c.status === 'completed').length,
      totalChunks: updatedChunks.length
    });

  } catch (error: any) {
    console.error('[API StartTranslation Error]', error);
    if (id) {
      await JobsRepository.updateStatus(id, 'failed', {
        errorMessage: error?.message || 'Unexpected translation run error',
      });
    }
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to execute translation step' } },
      { status: 500 }
    );
  }
}
