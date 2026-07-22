import type { SubtitleCue, TranslationItem } from '../../types/subtitles';

export function formatSRT(
  cues: SubtitleCue[],
  translations: Map<number, TranslationItem>
): string {
  const blocks: string[] = [];

  for (const cue of cues) {
    const translation = translations.get(cue.index);
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

  return blocks.join('\n\n') + '\n';
}

export function buildTranslationMap(
  items: TranslationItem[]
): Map<number, TranslationItem> {
  const map = new Map<number, TranslationItem>();
  for (const item of items) {
    map.set(item.index, item);
  }
  return map;
}
