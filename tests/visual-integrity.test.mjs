import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../lib/intelligence/renderer.ts', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../lib/traffic-renderer.ts', import.meta.url), 'utf8');
const globe = readFileSync(new URL('../lib/globe.ts', import.meta.url), 'utf8');
const labels = readFileSync(new URL('../lib/country-label-overlay.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/atlas-v2.module.css', import.meta.url), 'utf8');

test('intelligence markers respect globe depth and horizon occlusion', () => {
  assert.doesNotMatch(renderer, /disableDepthTestDistance:\s*Number\.POSITIVE_INFINITY/);
  assert.match(renderer, /disableDepthTestDistance:\s*0/);
  assert.match(renderer, /transformPositionToScaledSpace/);
  assert.match(renderer, /aboveHorizon/);
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


test('country labels use browser text instead of the Cesium glyph atlas', () => {
  assert.doesNotMatch(globe, /new C\.LabelCollection/);
  assert.match(labels, /document\.createElement\('span'\)/);
  assert.match(labels, /Math\.round\(screen\.x\)/);
  assert.match(labels, /maxVisible/);
  assert.doesNotMatch(globe, /disableDepthTestDistance:Number\.POSITIVE_INFINITY/);
});

test('responsive chrome supports compact desktop and mobile safe areas', () => {
  assert.match(css, /max-width:1100px/);
  assert.match(css, /safe-area-inset-top/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /panelClose/);
});

test('intelligence visibility work is frame-coalesced and viewport-scaled', () => {
  assert.match(renderer, /requestAnimationFrame/);
  assert.match(renderer, /areaScale/);
  assert.match(renderer, /namespace = item\.signal\.kind === 'satellites'/);
});
