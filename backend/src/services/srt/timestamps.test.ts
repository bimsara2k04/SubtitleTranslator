import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimestampLine, timestampToMs } from './timestamps.js';

test('parseTimestampLine parses a valid line', () => {
  const result = parseTimestampLine('00:01:30,500 --> 00:01:35,750');
  assert.ok(result);
  assert.equal(result.startTime, '00:01:30,500');
  assert.equal(result.endTime, '00:01:35,750');
  assert.equal(result.durationMs, 5250);
});

test('parseTimestampLine tolerates extra whitespace', () => {
  const result = parseTimestampLine('  00:00:01,000 -->  00:00:03,000  ');
  assert.ok(result);
  assert.equal(result.durationMs, 2000);
});

test('parseTimestampLine returns null for malformed input', () => {
  assert.equal(parseTimestampLine('not a timestamp'), null);
  assert.equal(parseTimestampLine('00:00:01,000 -> 00:00:03,000'), null);
  assert.equal(parseTimestampLine(''), null);
});

test('timestampToMs converts correctly', () => {
  assert.equal(timestampToMs('00:00:00,500'), 500);
  assert.equal(timestampToMs('00:01:00,000'), 60000);
  assert.equal(timestampToMs('01:00:00,000'), 3600000);
});

test('timestampToMs throws on bad input', () => {
  assert.throws(() => timestampToMs('garbage'));
});
