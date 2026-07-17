import { JobsRepository } from '../../db/repositories/jobs.js';
import { ChunksRepository } from '../../db/repositories/chunks.js';
import { ExportsRepository } from '../../db/repositories/exports.js';
import { parseSRT } from '../srt/parse.js';
import { formatSRT, buildTranslationMap } from '../srt/format.js';
import type { ExportRecord } from '../../types/jobs.js';
import type { TranslationItem } from '../../types/subtitles.js';

export async function rebuildOutput(jobId: string): Promise<ExportRecord> {
  const job = await JobsRepository.findById(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  // 1. Fetch chunks and consolidate translated items
  const chunks = await ChunksRepository.findByJobId(jobId);
  const allTranslatedItems: TranslationItem[] = [];

  for (const chunk of chunks) {
    if (chunk.status !== 'completed' || !chunk.translatedItems) {
      throw new Error(`Cannot rebuild output for job ${jobId}. Chunk ${chunk.chunkIndex} is in status "${chunk.status}".`);
    }
    allTranslatedItems.push(...chunk.translatedItems);
  }

  // 2. Fetch or parse original cues
  // Since we don't store source cues globally, we can reconstruct them from chunks
  // or re-parse the source SRT file metadata if we saved it (but chunk.cuesToTranslate is already in the database!)
  const originalCues = chunks
    .flatMap((c) => c.cuesToTranslate)
    .sort((a, b) => a.index - b.index);

  // 3. Format final SRT file with translated lines
  const translationMap = buildTranslationMap(allTranslatedItems);
  const finalSRTContent = formatSRT(originalCues, translationMap);

  // 4. Determine export filename
  const cleanName = job.sourceFilename.replace(/\.srt$/i, '');
  const exportFilename = `${cleanName}_translated_${job.targetLanguage.substring(0, 5).toLowerCase()}.srt`;

  // 5. Store export record
  const record = await ExportsRepository.create({
    jobId,
    filename: exportFilename,
    content: finalSRTContent,
  });

  return record;
}
