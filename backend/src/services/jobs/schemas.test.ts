import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUploadBody } from './schemas.js';

test('parseUploadBody accepts a valid body and applies defaults', () => {
  const result = parseUploadBody({
    targetLanguage: 'Sinhala',
    model: 'gemini-3.5-flash',
    toneStyle: 'literal',
    glossary: ' "AI" -> "IA" ',
    filename: 'movie.srt',
  });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.targetLanguage, 'Sinhala');
    assert.equal(result.data.model, 'gemini-3.5-flash');
    assert.equal(result.data.toneStyle, 'literal');
    assert.equal(result.data.glossary, '"AI" -> "IA"');
  }
});

test('parseUploadBody applies defaults when optional fields are omitted', () => {
  const result = parseUploadBody({ targetLanguage: 'French', filename: 'a.srt' });
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.model, 'gemini-3.6-flash');
    assert.equal(result.data.toneStyle, 'natural');
    assert.equal(result.data.glossary, '');
  }
});

test('parseUploadBody rejects missing targetLanguage', () => {
  const result = parseUploadBody({ filename: 'a.srt' });
  assert.equal(result.success, false);
});

test('parseUploadBody rejects unknown models', () => {
  const result = parseUploadBody({ targetLanguage: 'French', model: 'gemini-999', filename: 'a.srt' });
  assert.equal(result.success, false);
});

test('parseUploadBody rejects unknown tones', () => {
  const result = parseUploadBody({ targetLanguage: 'French', toneStyle: 'sarcastic', filename: 'a.srt' });
  assert.equal(result.success, false);
});

test('parseUploadBody rejects oversized glossaries', () => {
  const result = parseUploadBody({
    targetLanguage: 'French',
    glossary: 'x'.repeat(5000),
    filename: 'a.srt',
  });
  assert.equal(result.success, false);
});
