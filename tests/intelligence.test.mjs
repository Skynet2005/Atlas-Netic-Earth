import test from 'node:test';
import assert from 'node:assert/strict';
import { boxesAround, centroidOfCoordinates, parseCsv, parseTleCatalog, parseViewQuery, severityFromMagnitude } from '../lib/intelligence/parsers.ts';

test('intelligence view queries validate and quarter-degree bucket coordinates', () => {
  assert.deepEqual(parseViewQuery(new URLSearchParams('lat=38.981&lon=-76.937')), { latitude: 39, longitude: -77 });
  assert.throws(() => parseViewQuery(new URLSearchParams('lat=91&lon=0')));
});

test('dateline-aware regional boxes stay valid', () => {
  for (const longitude of [-179, 179]) {
    const boxes = boxesAround(60, longitude);
    assert.equal(boxes.length, 2);
    for (const box of boxes) { assert.ok(box.west >= -180 && box.east <= 180); assert.ok(box.south >= -90 && box.north <= 90); }
  }
});

test('GeoJSON coordinate centroids work for points and nested polygons', () => {
  assert.deepEqual(centroidOfCoordinates([-80, 30]), { latitude: 30, longitude: -80 });
  const polygon = [[[-80,30],[-78,30],[-78,32],[-80,32],[-80,30]]];
  const center = centroidOfCoordinates(polygon);
  assert.ok(center && center.latitude > 30 && center.latitude < 32 && center.longitude > -80 && center.longitude < -78);
});

test('CSV parser preserves quoted commas', () => {
  const [row] = parseCsv('latitude,longitude,label\n30,-80,"Alpha, Bravo"\n');
  assert.equal(row.label, 'Alpha, Bravo');
});

test('TLE catalog parser keeps names and line pairs without inventing positions', () => {
  const text = 'ISS (ZARYA)\n1 25544U 98067A   26260.50000000  .00010000  00000-0  18000-3 0  9999\n2 25544  51.6400 120.0000 0005000 200.0000 160.0000 15.50000000123456\n';
  const [record] = parseTleCatalog(text, 'STATIONS');
  assert.equal(record.id, '25544'); assert.equal(record.name, 'ISS (ZARYA)'); assert.match(record.line1, /^1 /); assert.match(record.line2, /^2 /);
});

test('earthquake severity is deterministic', () => {
  assert.equal(severityFromMagnitude(7.2), 'extreme');
  assert.equal(severityFromMagnitude(5.4), 'moderate');
  assert.equal(severityFromMagnitude(2.1), 'info');
});
