import type { SubtitleCue, ParsedSRT, ValidationIssue } from '../../types/subtitles';
import { parseTimestampLine } from './timestamps';

export function parseSRT(raw: string): ParsedSRT {
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const blocks = normalized.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);

  const cues: SubtitleCue[] = [];
  const parseErrors: ValidationIssue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');

    if (lines.length < 3) {
      if (lines.length < 2) {
        parseErrors.push({
          severity: 'error',
          cueIndex: null,
          code: 'MALFORMED_BLOCK',
          message: `Block has fewer than 2 lines: "${block.substring(0, 60)}"`,
        });
        continue;
      }
    }

    const indexLine = lines[0]?.trim() ?? '';
    const timestampLine = lines[1]?.trim() ?? '';
    const textLines = lines.slice(2).map((l) => l.trim()).filter(Boolean);

    const parsedIndex = parseInt(indexLine, 10);
    if (isNaN(parsedIndex) || String(parsedIndex) !== indexLine) {
      parseErrors.push({
        severity: 'error',
        cueIndex: null,
        code: 'INVALID_INDEX',
        message: `Expected integer index, got "${indexLine}"`,
      });
      continue;
    }

    const timestamps = parseTimestampLine(timestampLine);
    if (!timestamps) {
      parseErrors.push({
        severity: 'error',
        cueIndex: parsedIndex,
        code: 'INVALID_TIMESTAMP_LINE',
        message: `Invalid timestamp line at cue ${parsedIndex}: "${timestampLine}"`,
      });
      continue;
    }

    cues.push({
      index: parsedIndex,
      startTime: timestamps.startTime,
      endTime: timestamps.endTime,
      durationMs: timestamps.durationMs,
      textLines,
    });
  }

  return {
    cues,
    totalCues: cues.length,
    rawText: normalized,
  };
}

export function looksLikeSRT(content: string): boolean {
  return /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(content);
}
