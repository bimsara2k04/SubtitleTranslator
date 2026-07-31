import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSource, validateTranslations } from './validate.js';
import type { SubtitleCue, TranslationItem } from '../../types/subtitles.js';

function cue(index: number, startTime: string, endTime: string, textLines: string[]): SubtitleCue {
  return {
    index,
    startTime,
    endTime,
    durationMs: 1000,
    textLines,
  };
}

test('validateSource flags empty files', () => {
  const result = validateSource([]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'EMPTY_FILE'));
});

test('validateSource flags duplicate indexes', () => {
  const result = validateSource([cue(1, '00:00:01,000', '00:00:02,000', ['a']), cue(1, '00:00:02,000', '00:00:03,000', ['b'])]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'DUPLICATE_INDEX'));
});

test('validateSource warns on non-sequential indexes', () => {
  const result = validateSource([cue(1, '00:00:01,000', '00:00:02,000', ['a']), cue(5, '00:00:02,000', '00:00:03,000', ['b'])]);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((e) => e.code === 'NON_SEQUENTIAL_INDEX'));
});

test('validateSource flags negative durations and warns on zero duration', () => {
  const negative = cue(1, '00:00:03,000', '00:00:01,000', ['a']);
  negative.durationMs = -2000;
  const zero = cue(2, '00:00:04,000', '00:00:04,000', ['b']);
  zero.durationMs = 0;
  const result = validateSource([negative, zero]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'NEGATIVE_DURATION'));
  assert.ok(result.warnings.some((e) => e.code === 'ZERO_DURATION'));
});

test('validateTranslations warns on missing translations (fallback to source)', () => {
  const requested = [cue(1, 'a', 'b', ['hello']), cue(2, 'a', 'b', ['world'])];
  const items: TranslationItem[] = [{ index: 1, translatedLines: ['hola'] }];
  const result = validateTranslations(requested, items);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((e) => e.code === 'MISSING_TRANSLATION'));
});

test('validateTranslations errors on duplicate and unexpected indexes', () => {
  const requested = [cue(1, 'a', 'b', ['hello'])];
  const items: TranslationItem[] = [
    { index: 1, translatedLines: ['hola'] },
    { index: 1, translatedLines: ['oye'] },
    { index: 99, translatedLines: ['x'] },
  ];
  const result = validateTranslations(requested, items);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'DUPLICATE_TRANSLATED_INDEX'));
  assert.ok(result.errors.some((e) => e.code === 'UNEXPECTED_INDEX'));
});

test('validateTranslations is O(n)-correct for large inputs', () => {
  const count = 2000;
  const requested: SubtitleCue[] = Array.from({ length: count }, (_, i) =>
    cue(i + 1, 'a', 'b', [`text ${i + 1}`])
  );
  const items: TranslationItem[] = requested.map((c) => ({
    index: c.index,
    translatedLines: c.textLines,
  }));
  const result = validateTranslations(requested, items);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});
