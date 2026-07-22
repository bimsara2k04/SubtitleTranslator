import type { Request, Response, NextFunction } from 'express';
import { JobsRepository } from '../db/repositories/jobs.js';
import { ChunksRepository } from '../db/repositories/chunks.js';
import { keyPool } from '../services/gemini/keyPool.js';

export async function handleGetEstimate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    if (!id) {
      res.status(400).json({ error: { code: 'MISSING_PARAM', message: 'Job ID is required.' } });
      return;
    }

    const job = await JobsRepository.findById(id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: `Job ${id} not found.` } });
      return;
    }

    const chunks = await ChunksRepository.findByJobId(id);

    // 1. Estimate token counts:
    // Simple heuristic: 1 token ~= 4 characters. We multiply by 1.5 to cover Gemini system instruction overhead.
    let totalTextChars = 0;
    for (const chunk of chunks) {
      for (const cue of chunk.cuesToTranslate) {
        totalTextChars += cue.textLines.join('\n').length;
      }
    }
    const estimatedInputTokens = Math.ceil(totalTextChars / 4);
    // Translation output will be roughly the same length as input text
    const estimatedOutputTokens = estimatedInputTokens;
    // Add prompt instructions overhead (~1500 tokens per call)
    const promptInstructionsOverhead = chunks.length * 1500;
    const estimatedTotalTokens = estimatedInputTokens + estimatedOutputTokens + promptInstructionsOverhead;

    // 2. Compute calls needed (one call per chunk)
    const estimatedCalls = chunks.length;

    // 3. Get Key Pool statuses
    const keyStatuses = keyPool.getKeysStatus();

    // 4. Check if any single project can handle the entire job, or if we need failover
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

    // 5. Generate appropriate warning message
    let throttleWarning: string | null = null;
    if (!canCompleteWithoutFailover) {
      if (canCompleteWithFailover) {
        throttleWarning = `The active Gemini project does not have enough remaining quota to complete this job alone (${estimatedCalls} calls needed). The app will automatically fail over to other configured projects mid-run to complete translation.`;
      } else {
        throttleWarning = `CRITICAL WARNING: The total remaining quota across all projects (${combinedCallsRemaining} calls) is less than the required ${estimatedCalls} calls. The job will likely throttle mid-run. Please add more API keys or wait for daily reset.`;
      }
    }

    res.json({
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
  } catch (error) {
    next(error);
  }
}
