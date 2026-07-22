export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { JobsRepository } from '@/lib/server/db/repositories/jobs';
import { ChunksRepository } from '@/lib/server/db/repositories/chunks';
import { keyPool } from '@/lib/server/services/gemini/keyPool';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: { code: 'MISSING_PARAM', message: 'Job ID is required.' } }, { status: 400 });
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: `Job ${id} not found.` } }, { status: 404 });
    }

    const chunks = await ChunksRepository.findByJobId(id);

    let totalTextChars = 0;
    for (const chunk of chunks) {
      for (const cue of chunk.cuesToTranslate) {
        totalTextChars += cue.textLines.join('\n').length;
      }
    }
    const estimatedInputTokens = Math.ceil(totalTextChars / 4);
    const estimatedOutputTokens = estimatedInputTokens;
    const promptInstructionsOverhead = chunks.length * 1500;
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens + promptInstructionsOverhead;

    const estimatedCalls = chunks.length;
    const keyStatuses = keyPool.getKeysStatus();

    let canCompleteWithoutFailover = false;
    let combinedCallsRemaining = 0;

    const enrichedProjects = keyStatuses.map((p) => {
      const canCompleteJobAlone = !p.onCooldown && p.dailyCallsRemaining >= estimatedCalls;
      if (canCompleteJobAlone) {
        canCompleteWithoutFailover = true;
      }
      combinedCallsRemaining += p.dailyCallsRemaining;
      return {
        ...p,
        canCompleteJobAlone,
      };
    });

    const canCompleteWithFailover = combinedCallsRemaining >= estimatedCalls;

    let throttleWarning: string | null = null;
    if (!canCompleteWithoutFailover) {
      if (canCompleteWithFailover) {
        throttleWarning = `The active Gemini project does not have enough remaining quota to complete this job alone (${estimatedCalls} calls needed). The app will automatically fail over to other configured projects mid-run to complete translation.`;
      } else {
        throttleWarning = `CRITICAL WARNING: The total remaining quota across all projects (${combinedCallsRemaining} calls) is less than the required ${estimatedCalls} calls. The job will likely throttle mid-run. Please add more API keys or wait for daily reset.`;
      }
    }

    return NextResponse.json({
      estimatedCalls,
      estimatedTotalTokens,
      estimatedChunks: chunks.length,
      totalCues: job.totalCues,
      projects: enrichedProjects,
      combinedCallsRemaining,
      canCompleteWithoutFailover,
      canCompleteWithFailover,
      throttleWarning,
      isEstimate: true,
    });
  } catch (error: any) {
    console.error('[API Estimate Error]', error);
    return NextResponse.json(
      { error: { message: error?.message || 'Failed to fetch estimate' } },
      { status: 500 }
    );
  }
}
