import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSRT, looksLikeSRT } from './parse.js';

test('parseSRT parses a valid SRT file', () => {
  const srt = `1
00:00:01,000 --> 00:00:03,000
Hello world

2
00:00:04,000 --> 00:00:06,500
Second line
With a break

3
00:00:07,000 --> 00:00:09,000
<i>Third</i>`;
  const result = parseSRT(srt);
  assert.equal(result.totalCues, 3);
  assert.equal(result.parseErrors.length, 0);
  assert.deepEqual(result.cues.map((c) => c.index), [1, 2, 3]);
  assert.equal(result.cues[1]?.textLines.join('\n'), 'Second line\nWith a break');
  assert.equal(result.cues[0]?.durationMs, 2000);
});

test('parseSRT normalizes CRLF and strips BOM', () => {
  const srt = '\uFEFF1\r\n00:00:01,000 --> 00:00:03,000\r\nHello\r\n\r\n';
  const result = parseSRT(srt);
  assert.equal(result.totalCues, 1);
  assert.equal(result.cues[0]?.textLines[0], 'Hello');
});

test('parseSRT records parse errors for malformed blocks instead of dropping them silently', () => {
  const srt = `1
00:00:01,000 --> 00:00:03,000
Hello

garbage block without timestamps

2
00:00:04,000 --> 00:00:06,000
World`;
  const result = parseSRT(srt);
  assert.equal(result.totalCues, 2);
  assert.equal(result.parseErrors.length, 1);
  assert.equal(result.parseErrors[0]?.severity, 'error');
});

test('parseSRT flags invalid timestamp lines', () => {
  const srt = `1
00:00:01,000 --> not-a-timestamp
Hello`;
  const result = parseSRT(srt);
  assert.equal(result.totalCues, 0);
  assert.ok(result.parseErrors.some((e) => e.code === 'INVALID_TIMESTAMP_LINE'));
});

test('parseSRT flags invalid index lines', () => {
  const srt = `first
00:00:01,000 --> 00:00:03,000
Hello`;
  const result = parseSRT(srt);
  assert.equal(result.totalCues, 0);
  assert.ok(result.parseErrors.some((e) => e.code === 'INVALID_INDEX'));
});

test('looksLikeSRT detects timestamp markers', () => {
  assert.equal(looksLikeSRT('00:00:01,000 --> 00:00:03,000'), true);
  assert.equal(looksLikeSRT('no timestamps here'), false);
});
