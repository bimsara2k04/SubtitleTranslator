import { JobsRepository } from '../../db/repositories/jobs';
import { ChunksRepository } from '../../db/repositories/chunks';
import { ExportsRepository } from '../../db/repositories/exports';
import { formatSRT, buildTranslationMap } from '../srt/format';
import type { ExportRecord } from '../../types/jobs';
import type { TranslationItem } from '../../types/subtitles';

export async function rebuildOutput(jobId: string): Promise<ExportRecord> {
  const job = await JobsRepository.findById(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found`);
  }

  const chunks = await ChunksRepository.findByJobId(jobId);
  const allTranslatedItems: TranslationItem[] = [];

  for (const chunk of chunks) {
    if (chunk.status !== 'completed' || !chunk.translatedItems) {
      throw new Error(`Cannot rebuild output for job ${jobId}. Chunk ${chunk.chunkIndex} is in status "${chunk.status}".`);
    }
    allTranslatedItems.push(...chunk.translatedItems);
  }

  const originalCues = chunks
    .flatMap((c) => c.cuesToTranslate)
    .sort((a, b) => a.index - b.index);

  const translationMap = buildTranslationMap(allTranslatedItems);
  const finalSRTContent = formatSRT(originalCues, translationMap);

  const cleanName = job.sourceFilename.replace(/\.srt$/i, '');
  const exportFilename = `${cleanName}_translated_${job.targetLanguage.substring(0, 5).toLowerCase()}.srt`;

  const record = await ExportsRepository.create({
    jobId,
    filename: exportFilename,
    content: finalSRTContent,
  });

  return record;
}
