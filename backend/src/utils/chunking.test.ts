import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkCues } from './chunking.js';
import type { SubtitleCue } from '../types/subtitles.js';

function cue(index: number, textLines: string[]): SubtitleCue {
  return {
    index,
    startTime: '00:00:00,000',
    endTime: '00:00:01,000',
    durationMs: 1000,
    textLines,
  };
}

test('chunkCues splits by max cue count', () => {
  const cues = Array.from({ length: 25 }, (_, i) => cue(i + 1, ['line']));
  const chunks = chunkCues(cues, { maxCues: 10, maxChars: 1_000_000, estimatedTokenBudget: 1_000_000 });
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0]?.length, 10);
  assert.equal(chunks[1]?.length, 10);
  assert.equal(chunks[2]?.length, 5);
});

test('chunkCues splits by character budget', () => {
  const cues = [cue(1, ['a'.repeat(100)]), cue(2, ['b'.repeat(100)])];
  const chunks = chunkCues(cues, { maxCues: 10, maxChars: 150, estimatedTokenBudget: 1_000_000 });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.length, 1);
  assert.equal(chunks[1]?.length, 1);
});

test('chunkCues handles empty input', () => {
  assert.deepEqual(chunkCues([]), []);
});

test('chunkCues keeps a single oversized cue in its own chunk', () => {
  const cues = [cue(1, ['x'.repeat(5000)])];
  const chunks = chunkCues(cues, { maxCues: 10, maxChars: 1000, estimatedTokenBudget: 100 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.length, 1);
});
