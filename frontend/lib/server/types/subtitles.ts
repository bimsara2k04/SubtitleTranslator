/**
 * Core subtitle domain types.
 * Timestamps are always owned by the application — never sent to Gemini.
 */

export type SubtitleCue = {
  /** 1-based sequence number from the SRT file */
  index: number;
  /** Original HH:MM:SS,mmm timestamp string */
  startTime: string;
  /** Original HH:MM:SS,mmm timestamp string */
  endTime: string;
  /** Duration in milliseconds, derived from timestamps */
  durationMs: number;
  /** Original text lines (before translation) */
  textLines: string[];
};

export type TranslationItem = {
  /** Corresponds to SubtitleCue.index */
  index: number;
  /** Translated text lines returned by Gemini */
  translatedLines: string[];
};

export type ParsedSRT = {
  cues: SubtitleCue[];
  totalCues: number;
  /** Raw source text — preserved for debugging */
  rawText: string;
};

export type ValidationSeverity = 'error' | 'warning';

export type ValidationIssue = {
  severity: ValidationSeverity;
  cueIndex: number | null;
  code: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};
