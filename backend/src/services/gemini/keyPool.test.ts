import { test, before } from 'node:test';
import assert from 'node:assert/strict';

process.env.GEMINI_API_KEYS = 'key-one,key-two,key-three';

const { keyPool } = await import('./keyPool.js');

before(() => {
  keyPool.initializePool();
});

test('key pool loads keys from GEMINI_API_KEYS', () => {
  assert.equal(keyPool.getKeyCount(), 3);
  const status = keyPool.getKeysStatus();
  assert.equal(status.length, 3);
  assert.deepEqual(status.map((s) => s.label), ['project-1', 'project-2', 'project-3']);
});

test('acquireKey never double-books a key for concurrent reservations', async () => {
  const [a, b, c] = await Promise.all([
    keyPool.acquireKey(),
    keyPool.acquireKey(),
    keyPool.acquireKey(),
  ]);
  const labels = new Set([a.projectLabel, b.projectLabel, c.projectLabel]);
  assert.equal(labels.size, 3, 'each concurrent acquire should reserve a distinct key');

  // Release all so later tests are not blocked.
  keyPool.releaseKey(a.key);
  keyPool.releaseKey(b.key);
  keyPool.releaseKey(c.key);
});

test('reportSuccess throttles the key for minimum spacing', async () => {
  const key = await keyPool.acquireKey();
  const initial = key.throttleUntil;
  assert.equal(initial, null);
  keyPool.reportSuccess(key.key);
  const throttled: Date | null = key.throttleUntil;
  assert.ok(throttled instanceof Date);
  assert.ok(throttled.getTime() > Date.now());
});

test('reportFailure with a daily-limit error locks the key until reset', async () => {
  const key = await keyPool.acquireKey();
  const err = new Error('RESOURCE_EXHAUSTED: PerDayPerProjectPerModel-FreeTier limit: 20');
  keyPool.reportFailure(key.key, err);
  assert.equal(key.dailyCallsUsed, key.dailyCallsLimit);
  assert.ok(key.cooldownUntil instanceof Date);
  assert.ok(key.cooldownUntil.getTime() > Date.now() + 6 * 60 * 60 * 1000, 'should be locked until next midnight');
});
