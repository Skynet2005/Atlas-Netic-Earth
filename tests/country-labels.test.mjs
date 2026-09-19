import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countryLabelFontSize,
  countryLabelMaximumDistance,
  countryLabelViewport,
  showCountryLabels,
} from '../lib/country-labels.ts';

test('country labels respect enable state, altitude, viewport, and pitch', () => {
  assert.equal(showCountryLabels(false, 2_000_000, 1440, -45), false);
  assert.equal(showCountryLabels(true, 100_000, 1440, -45), false);
  assert.equal(showCountryLabels(true, 200_000, 1440, -45), true);
  assert.equal(showCountryLabels(true, 250_000, 390, -45), false);
  assert.equal(showCountryLabels(true, 300_000, 390, -45), true);
  assert.equal(showCountryLabels(true, 2_000_000, 1440, -5), false);
});

test('important countries remain visible farther away than small labels', () => {
  assert.ok(countryLabelMaximumDistance(2) > countryLabelMaximumDistance(4));
  assert.ok(countryLabelMaximumDistance(4) > countryLabelMaximumDistance(6));
});

test('label typography and density adapt to desktop and mobile', () => {
  assert.ok(countryLabelFontSize(1440, 2_000_000, 2) > countryLabelFontSize(390, 2_000_000, 2));
  assert.ok(countryLabelFontSize(1440, 2_000_000, 2) > countryLabelFontSize(1440, 2_000_000, 6));
  assert.ok(countryLabelViewport(1440, 900, 2_000_000).maxVisible > countryLabelViewport(390, 844, 2_000_000).maxVisible);
});
