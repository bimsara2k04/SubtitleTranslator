import type {
  SubtitleCue,
  TranslationItem,
  ValidationResult,
  ValidationIssue,
} from '../../types/subtitles';
import { TIMESTAMP_REGEX } from './timestamps';

const MAX_CPS = 25;
const MAX_EXPANSION_RATIO = 3.0;

export function validateSource(cues: SubtitleCue[]): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (cues.length === 0) {
    errors.push({
      severity: 'error',
      cueIndex: null,
      code: 'EMPTY_FILE',
      message: 'No subtitle cues were found in the file.',
    });
    return { valid: false, errors, warnings };
  }

  const seenIndexes = new Set<number>();

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (!cue) continue;

    if (seenIndexes.has(cue.index)) {
      errors.push({
        severity: 'error',
        cueIndex: cue.index,
        code: 'DUPLICATE_INDEX',
        message: `Duplicate cue index ${cue.index}.`,
      });
    }
    seenIndexes.add(cue.index);

    if (i > 0) {
      const prev = cues[i - 1];
      if (prev && cue.index !== prev.index + 1) {
        warnings.push({
          severity: 'warning',
          cueIndex: cue.index,
          code: 'NON_SEQUENTIAL_INDEX',
          message: `Cue index ${cue.index} follows ${prev.index} — expected ${prev.index + 1}.`,
        });
      }
    }

    if (!TIMESTAMP_REGEX.test(cue.startTime)) {
      errors.push({
        severity: 'error',
        cueIndex: cue.index,
        code: 'INVALID_START_TIMESTAMP',
        message: `Invalid start timestamp "${cue.startTime}" on cue ${cue.index}.`,
      });
    }
    if (!TIMESTAMP_REGEX.test(cue.endTime)) {
      errors.push({
        severity: 'error',
        cueIndex: cue.index,
        code: 'INVALID_END_TIMESTAMP',
        message: `Invalid end timestamp "${cue.endTime}" on cue ${cue.index}.`,
      });
    }

    if (cue.durationMs < 0) {
      errors.push({
        severity: 'error',
        cueIndex: cue.index,
        code: 'NEGATIVE_DURATION',
        message: `Cue ${cue.index} has end time before start time (duration: ${cue.durationMs}ms).`,
      });
    } else if (cue.durationMs === 0) {
      warnings.push({
        severity: 'warning',
        cueIndex: cue.index,
        code: 'ZERO_DURATION',
        message: `Cue ${cue.index} has zero duration.`,
      });
    }

    if (cue.textLines.length === 0) {
      warnings.push({
        severity: 'warning',
        cueIndex: cue.index,
        code: 'EMPTY_TEXT',
        message: `Cue ${cue.index} has no text lines.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateTranslations(
  requestedCues: SubtitleCue[],
  translatedItems: TranslationItem[]
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const requestedIndexes = new Set(requestedCues.map((c) => c.index));
  const returnedIndexes = new Set(translatedItems.map((t) => t.index));

  for (const cue of requestedCues) {
    if (!returnedIndexes.has(cue.index)) {
      warnings.push({
        severity: 'warning',
        cueIndex: cue.index,
        code: 'MISSING_TRANSLATION',
        message: `Translation missing for cue index ${cue.index} — source text will be used as fallback.`,
      });
    }
  }

  for (const item of translatedItems) {
    if (!requestedIndexes.has(item.index)) {
      errors.push({
        severity: 'error',
        cueIndex: item.index,
        code: 'UNEXPECTED_INDEX',
        message: `Gemini returned unexpected cue index ${item.index}.`,
      });
    }

    const count = translatedItems.filter((t) => t.index === item.index).length;
    if (count > 1) {
      errors.push({
        severity: 'error',
        cueIndex: item.index,
        code: 'DUPLICATE_TRANSLATED_INDEX',
        message: `Gemini returned duplicate translations for index ${item.index}.`,
      });
    }
  }

  for (const item of translatedItems) {
    const sourceCue = requestedCues.find((c) => c.index === item.index);
    if (!sourceCue) continue;

    if (
      item.translatedLines.length === 0 ||
      item.translatedLines.every((l) => l.trim() === '')
    ) {
      if (sourceCue.textLines.length > 0) {
        warnings.push({
          severity: 'warning',
          cueIndex: item.index,
          code: 'EMPTY_TRANSLATION',
          message: `Empty translation returned for cue ${item.index} which had source text — source text will be used as fallback.`,
        });
      }
      continue;
    }

    if (sourceCue.durationMs > 0) {
      const translatedText = item.translatedLines.join(' ');
      const charCount = translatedText.length;
      const durationSeconds = sourceCue.durationMs / 1000;
      const cps = charCount / durationSeconds;

      if (cps > MAX_CPS) {
        warnings.push({
          severity: 'warning',
          cueIndex: item.index,
          code: 'HIGH_CPS',
          message: `Cue ${item.index} translation is ${cps.toFixed(1)} chars/sec (threshold: ${MAX_CPS}). May be too fast to read.`,
        });
      }
    }

    const sourceChars = sourceCue.textLines.join(' ').length;
    const translatedChars = item.translatedLines.join(' ').length;
    if (sourceChars > 0 && translatedChars / sourceChars > MAX_EXPANSION_RATIO) {
      warnings.push({
        severity: 'warning',
        cueIndex: item.index,
        code: 'EXCESSIVE_EXPANSION',
        message: `Cue ${item.index} translation is ${(translatedChars / sourceChars).toFixed(1)}x longer than source (threshold: ${MAX_EXPANSION_RATIO}x).`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
