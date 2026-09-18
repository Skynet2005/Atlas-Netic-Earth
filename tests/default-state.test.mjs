import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const atlas = readFileSync(new URL('../components/atlas-v2.tsx', import.meta.url), 'utf8');
const intelligence = readFileSync(new URL('../lib/intelligence/types.ts', import.meta.url), 'utf8');

test('all traffic layers start enabled', () => {
  assert.match(atlas, /useState<TrafficLayers>\(\{ air: true, military: true, maritime: true \}\)/);
});

test('all intelligence layers start enabled', () => {
  for (const layer of ['earthquakes', 'fires', 'weather', 'satellites']) {
    assert.match(intelligence, new RegExp(`\\b${layer}: true\\b`));
  }
});

test('primary menus start closed', () => {
  assert.match(atlas, /\[panelOpen, setPanelOpen\] = useState\(false\)/);
  assert.match(atlas, /\[toolsOpen, setToolsOpen\] = useState\(false\)/);
});
