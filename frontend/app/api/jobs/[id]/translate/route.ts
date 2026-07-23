export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse, after } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { ChunksRepository } from '@/lib/server/db/repositories/chunks';
import { processChunk } from '@/lib/server/services/jobs/processChunk';
import { rebuildOutput } from '@/lib/server/services/jobs/rebuildOutput';

async function runBackgroundJob(jobId: string): Promise<void> {
  try {
    await JobsRepository.updateStatus(jobId, 'translating');

    const attemptedChunkIds = new Set<string>();
    while (true) {
      const currentChunks = await ChunksRepository.findByJobId(jobId);
      const nextChunk = currentChunks.find(
        (c) => (c.status === 'pending' || c.status === 'failed') && !attemptedChunkIds.has(c.id)
      );
      if (!nextChunk) {
        break;
      }

      attemptedChunkIds.add(nextChunk.id);
      try {
        await processChunk(jobId, nextChunk.id);
      } catch (err: any) {
        const msg = err?.message || String(err);
        if (msg.includes('daily free-tier quota exhausted') || msg.includes('PerDayPerProjectPerModel-FreeTier')) {
          throw err;
        }
        console.warn(`[BackgroundJob] Chunk ${nextChunk.id} failed or was split:`, msg);
      }
    }

    const updatedChunks = await ChunksRepository.findByJobId(jobId);
    const allCompleted = updatedChunks.every((c) => c.status === 'completed');

    if (allCompleted) {
      await JobsRepository.updateStatus(jobId, 'rebuilding');
      await rebuildOutput(jobId);
      await JobsRepository.updateStatus(jobId, 'completed');
    } else {
      await JobsRepository.updateStatus(jobId, 'failed', {
        errorMessage: 'Some subtitle chunks failed to translate.',
      });
    }
  } catch (error: any) {
    console.error(`[BackgroundJob Error] Job ${jobId} failed:`, error);
    await JobsRepository.updateStatus(jobId, 'failed', {
      errorMessage: error?.message || 'Unexpected background error',
    });
  }
}

export async function POST(
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

    if (job.status === 'translating') {
      return NextResponse.json({ error: { message: 'Job is already translating.' } }, { status: 400 });
    }

    // Schedule background worker execution after response is sent
    after(() => runBackgroundJob(id));

    return NextResponse.json(
      { message: 'Translation started in background.', jobId: id },
      { status: 202 }
    );
  } catch (error: any) {
    console.error('[API StartTranslation Error]', error);
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to start translation' } },
      { status: 500 }
    );
  }
}
