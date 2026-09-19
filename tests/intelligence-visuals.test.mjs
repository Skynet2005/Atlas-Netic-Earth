import test from 'node:test';
import assert from 'node:assert/strict';
import { satelliteVisualClass, satelliteVisualSpec, signalIcon, signalVisualLabel } from '../lib/intelligence/visuals.ts';

const signal = (name, group = '') => ({ name, details: { group } });

test('satellite names and catalog groups map to conservative visual families', () => {
  assert.equal(satelliteVisualClass(signal('ISS (ZARYA)', 'STATIONS')), 'station');
  assert.equal(satelliteVisualClass(signal('STARLINK-1234', 'STARLINK')), 'starlink');
  assert.equal(satelliteVisualClass(signal('GPS BIIR-2', 'GPS-OPS')), 'navigation');
  assert.equal(satelliteVisualClass(signal('NOAA 20', 'WEATHER')), 'weather');
  assert.equal(satelliteVisualClass(signal('SENTINEL-2A', 'EARTH RESOURCES')), 'earth-observation');
  assert.equal(satelliteVisualClass(signal('IRIDIUM 33')), 'communications');
  assert.equal(satelliteVisualClass(signal('HUBBLE SPACE TELESCOPE', 'SCIENCE')), 'science');
  assert.equal(satelliteVisualClass(signal('NORAD 99999')), 'generic');
});

test('satellite specs always use generated 3D model assets', () => {
  const spec = satelliteVisualSpec(signal('STARLINK-1234', 'STARLINK'));
  assert.match(spec.low, /^\/models\/satellite-starlink-low\.gltf$/);
  assert.match(spec.detail, /^\/models\/satellite-starlink-detail\.gltf$/);
  assert.ok(spec.minimumPixelSize >= 24);
});

test('ground intelligence uses semantic SVG glyphs rather than anonymous points', () => {
  for (const entry of [
    { kind: 'earthquakes', severity: 'moderate' },
    { kind: 'fires', severity: 'info' },
    { kind: 'weather', severity: 'severe' },
  ]) {
    assert.match(signalIcon(entry), /^data:image\/svg\+xml/);
  }
  assert.equal(signalVisualLabel({ kind: 'fires', name: 'Fire', details: {} }), 'Active fire');
  assert.equal(signalVisualLabel({ kind: 'weather', name: 'Storm', details: {} }), 'Weather alert');
});
