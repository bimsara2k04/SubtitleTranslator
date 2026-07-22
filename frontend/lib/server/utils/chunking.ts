import type { SubtitleCue } from '../types/subtitles';

export type ChunkOptions = {
  maxCues?: number;
  maxChars?: number;
  estimatedTokenBudget?: number;
};

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxCues: 80,
  maxChars: 8000,
  estimatedTokenBudget: 2000,
};

/**
 * Estimate the number of tokens in a set of text lines.
 * A very simple heuristic: 1 token ~= 4 characters or 0.75 words.
 */
function estimateTokens(textLines: string[]): number {
  const text = textLines.join(' ');
  if (!text.trim()) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Split subtitle cues into chunks based on character/cue/token budget limits.
 */
export function chunkCues(
  cues: SubtitleCue[],
  options?: ChunkOptions
): SubtitleCue[][] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: SubtitleCue[][] = [];
  let currentChunk: SubtitleCue[] = [];

  let currentCueCount = 0;
  let currentCharCount = 0;
  let currentTokenEstimation = 0;

  for (const cue of cues) {
    const cueChars = cue.textLines.join('\n').length;
    const cueTokens = estimateTokens(cue.textLines);

    const wouldExceed =
      currentCueCount + 1 > opts.maxCues ||
      currentCharCount + cueChars > opts.maxChars ||
      currentTokenEstimation + cueTokens > opts.estimatedTokenBudget;

    if (wouldExceed && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentCueCount = 0;
      currentCharCount = 0;
      currentTokenEstimation = 0;
    }

    currentChunk.push(cue);
    currentCueCount += 1;
    currentCharCount += cueChars;
    currentTokenEstimation += cueTokens;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
