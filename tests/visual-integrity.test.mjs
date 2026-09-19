import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../lib/intelligence/renderer.ts', import.meta.url), 'utf8');
const traffic = readFileSync(new URL('../lib/traffic-renderer.ts', import.meta.url), 'utf8');
const globe = readFileSync(new URL('../lib/globe.ts', import.meta.url), 'utf8');
const labels = readFileSync(new URL('../lib/country-label-overlay.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../components/atlas-v2.module.css', import.meta.url), 'utf8');
const aircraftPreview = readFileSync(new URL('../components/aircraft-live-preview.tsx', import.meta.url), 'utf8');

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

test('traffic stays 3D and visually pronounced without billboard fallbacks', () => {
  assert.match(traffic, /distanceDisplayCondition/);
  assert.match(traffic, /6_000_000/);
  assert.match(traffic, /12_000_000/);
  assert.match(traffic, /silhouetteSize/);
  assert.match(traffic, /maximumScale/);
  assert.doesNotMatch(traffic, /billboard/i);
});

test('live intelligence has semantic identity instead of anonymous moving spheres or dots', () => {
  assert.match(renderer, /satelliteVisualSpec/);
  assert.match(renderer, /model:/);
  assert.match(renderer, /billboard:/);
  assert.match(renderer, /signalIcon/);
  assert.doesNotMatch(renderer, /ellipsoid:/);
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


test('semantic zoom aggregates globally and reveals individual objects closer in', () => {
  assert.match(renderer, /atlas-intelligence-density/);
  assert.match(renderer, /clusterIntelligence/);
  assert.match(renderer, /semanticZoomForAltitude/);
  assert.match(traffic, /atlas-traffic-density/);
  assert.match(traffic, /clusterTraffic/);
  assert.match(traffic, /nextZoom!=='global'/);
});


test('real time day night lighting is enabled at engine startup', () => {
  assert.match(globe, /enableLighting = true/);
  assert.match(globe, /dynamicAtmosphereLighting = true/);
  assert.match(globe, /dynamicAtmosphereLightingFromSun = true/);
  assert.match(globe, /maximumRenderTimeChange: 60/);
  assert.match(globe, /setDayNight\(enabled:boolean\)/);
});

test('aircraft detail uses a dedicated 3D live preview, not a static icon', () => {
  assert.match(aircraftPreview, /new C\.Viewer/);
  assert.match(aircraftPreview, /spec\.detail/);
  assert.match(aircraftPreview, /HeadingPitchRoll/);
  assert.match(aircraftPreview, /LIVE REPORT/);
  assert.doesNotMatch(aircraftPreview, /billboard/i);
});
