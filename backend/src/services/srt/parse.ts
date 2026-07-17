import type { SubtitleCue, ParsedSRT, ValidationIssue } from '../../types/subtitles.js';
import { parseTimestampLine, TIMESTAMP_REGEX } from './timestamps.js';

/**
 * Parse an SRT file string into structured subtitle cues.
 *
 * SRT format per block:
 * <index>
 * <HH:MM:SS,mmm --> HH:MM:SS,mmm>
 * <text line(s)>
 * <blank line>
 */
export function parseSRT(raw: string): ParsedSRT {
  // Normalize line endings and strip BOM
  const normalized = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Split into blocks on double newlines
  const blocks = normalized.split(/\n\n+/).map((b) => b.trim()).filter(Boolean);

  const cues: SubtitleCue[] = [];
  const parseErrors: ValidationIssue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');

    // At minimum: index line, timestamp line, one text line
    if (lines.length < 3) {
      // Might be a block with only index + timestamp (empty text) — still valid
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

    // Parse cue index
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

    // Parse timestamp line
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

/**
 * Quick validation check: is this string plausibly an SRT file?
 * Used for early rejection before full parse.
 */
export function looksLikeSRT(content: string): boolean {
  // Must have at least one timestamp line pattern
  return /\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(content);
}
