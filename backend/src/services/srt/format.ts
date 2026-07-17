import type { SubtitleCue, TranslationItem } from '../../types/subtitles.js';

/**
 * Format subtitle cues (with optional translated lines) back into a valid SRT string.
 * Uses original timestamps from the cue — the model never touches timing data.
 */
export function formatSRT(
  cues: SubtitleCue[],
  translations: Map<number, TranslationItem>
): string {
  const blocks: string[] = [];

  for (const cue of cues) {
    const translation = translations.get(cue.index);
    // Use translated lines if available, otherwise fall back to original
    const textLines =
      translation && translation.translatedLines.length > 0
        ? translation.translatedLines
        : cue.textLines;

    const block = [
      String(cue.index),
      `${cue.startTime} --> ${cue.endTime}`,
      ...textLines,
    ].join('\n');

    blocks.push(block);
  }

  // SRT blocks are separated by exactly one blank line, with a trailing newline
  return blocks.join('\n\n') + '\n';
}

/**
 * Build a Map<cueIndex, TranslationItem> from a flat array.
 * Useful for O(1) lookup during format.
 */
export function buildTranslationMap(
  items: TranslationItem[]
): Map<number, TranslationItem> {
  const map = new Map<number, TranslationItem>();
  for (const item of items) {
    map.set(item.index, item);
  }
  return map;
}
