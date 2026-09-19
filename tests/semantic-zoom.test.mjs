import test from 'node:test';
import assert from 'node:assert/strict';
import {
  semanticZoomForAltitude,
  clusterIntelligence,
  clusterTraffic,
  intelligenceClusterSummary,
  trafficClusterSummary,
} from '../lib/semantic-zoom.ts';

test('semantic zoom changes from global to regional to local', () => {
  assert.equal(semanticZoomForAltitude(18_000_000), 'global');
  assert.equal(semanticZoomForAltitude(2_000_000), 'regional');
  assert.equal(semanticZoomForAltitude(250_000), 'local');
});

test('intelligence clustering aggregates nearby mixed signals', () => {
  const base = { observedAt: 1, expiresAt: null, source: 'test', severity: 'info', quality: 'reported', details: {} };
  const clusters = clusterIntelligence([
    { ...base, id: 'a', kind: 'fires', name: 'A', latitude: 10, longitude: 10, altitude: null },
    { ...base, id: 'b', kind: 'weather', name: 'B', latitude: 11, longitude: 11, altitude: null, severity: 'severe' },
    { ...base, id: 'c', kind: 'earthquakes', name: 'C', latitude: -40, longitude: 80, altitude: null },
  ], 10);
  assert.equal(clusters.length, 2);
  const dense = clusters.find(cluster => cluster.count === 2);
  assert.ok(dense);
  assert.equal(dense.severity, 'severe');
  assert.equal(dense.counts.fires, 1);
  assert.equal(dense.counts.weather, 1);
  assert.match(intelligenceClusterSummary(dense), /WX 1|FIRE 1/);
});

test('traffic clustering preserves domain counts', () => {
  const base = { name: 'x', altitude: 0, altitudeReference: 'surface', speed: 0, heading: 0, observedAt: 1, source: 'test' };
  const clusters = clusterTraffic([
    { ...base, id: 'air:1', kind: 'air', latitude: 20, longitude: 20 },
    { ...base, id: 'air:2', kind: 'military', latitude: 21, longitude: 21 },
    { ...base, id: 'ship:1', kind: 'maritime', latitude: 22, longitude: 22 },
  ], 10);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].air, 1);
  assert.equal(clusters[0].military, 1);
  assert.equal(clusters[0].maritime, 1);
  assert.equal(trafficClusterSummary(clusters[0]), 'AIR 1 · MIL 1 · SEA 1');
});
