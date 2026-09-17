import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedSource, clearSourceRuntimeForTests } from '../lib/data/source-runtime.ts';

test('source runtime caches, coalesces, and falls back to stale data', async () => {
  clearSourceRuntimeForTests();
  let calls = 0;
  const loader = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return { value: 42 }; };
  const [a,b] = await Promise.all([
    cachedSource({ key:'x', ttlMs:1000, staleMs:5000, loader }),
    cachedSource({ key:'x', ttlMs:1000, staleMs:5000, loader }),
  ]);
  assert.equal(calls, 1); assert.equal(a.data.value, 42); assert.equal(b.data.value, 42);
  const hit = await cachedSource({ key:'x', ttlMs:1000, staleMs:5000, loader });
  assert.equal(hit.cache, 'hit'); assert.equal(calls, 1);
});

test('source runtime serves stale data when refresh fails inside stale window', async () => {
  clearSourceRuntimeForTests();
  await cachedSource({ key:'stale', ttlMs:0, staleMs:5000, loader: async () => 'first' });
  await new Promise(resolve => setTimeout(resolve, 2));
  const result = await cachedSource({ key:'stale', ttlMs:0, staleMs:5000, loader: async () => { throw new Error('offline'); } });
  assert.equal(result.data, 'first'); assert.equal(result.state, 'stale'); assert.equal(result.cache, 'stale');
});
