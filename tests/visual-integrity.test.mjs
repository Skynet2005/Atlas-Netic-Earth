import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../lib/intelligence/renderer.ts', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../lib/traffic-renderer.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/atlas-v2.module.css', import.meta.url), 'utf8');

test('intelligence markers respect globe depth and horizon occlusion', () => {
  assert.doesNotMatch(renderer, /disableDepthTestDistance:\s*Number\.POSITIVE_INFINITY/);
  assert.match(renderer, /disableDepthTestDistance:\s*0/);
  assert.match(renderer, /EllipsoidalOccluder/);
  assert.match(renderer, /isPointVisible/);
});

test('dense intelligence layers use distance scaling and screen-space decluttering', () => {
  assert.match(renderer, /scaleByDistance/);
  assert.match(renderer, /translucencyByDistance/);
  assert.match(renderer, /baseCell/);
  assert.match(renderer, /maxVisible/);
});

test('traffic stays 3D but is hidden at non-useful world scale', () => {
  assert.match(traffic, /distanceDisplayCondition/);
  assert.match(traffic, /3_500_000/);
  assert.match(traffic, /7_000_000/);
  assert.doesNotMatch(traffic, /billboard/i);
});

test('Atlas chrome keeps the globe visually dominant', () => {
  assert.match(css, /backdrop-filter/);
  assert.match(css, /radial-gradient/);
  assert.match(css, /prefers-reduced-motion/);
});
