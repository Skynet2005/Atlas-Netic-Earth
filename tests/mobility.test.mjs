import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')&&!/\.[a-z]+$/.test(specifier))return next(specifier+'.ts',context);throw error;}}});

const { parseCsv } = await import('../lib/mobility/csv.ts');
const ground = readFileSync(new URL('../lib/mobility/ground.ts', import.meta.url), 'utf8');
const faa = readFileSync(new URL('../lib/mobility/faa.ts', import.meta.url), 'utf8');
const notams = readFileSync(new URL('../lib/mobility/notams.ts', import.meta.url), 'utf8');
const amtrak = readFileSync(new URL('../lib/mobility/amtrak.ts', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../components/mobility-drawer.tsx', import.meta.url), 'utf8');
const globe = readFileSync(new URL('../lib/globe.ts', import.meta.url), 'utf8');

test('mobility CSV parser preserves quoted commas and escaped quotes', () => {
  const rows = parseCsv('id,name,remark\r\n1,"Alpha, Bravo","Say ""hello"""\r\n2,Charlie,Plain\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Alpha, Bravo');
  assert.equal(rows[0].remark, 'Say "hello"');
});

test('ground routing uses current HeiGIT endpoint and supports avoidance', () => {
  assert.match(ground, /https:\/\/api\.heigit\.org/);
  assert.match(ground, /tollways/);
  assert.match(ground, /highways/);
  assert.match(ground, /ferries/);
  assert.doesNotMatch(ground, /api\.openrouteservice\.org/);
});

test('aviation uses FAA NASR and gated NMS API rather than scraping NOTAM Search', () => {
  assert.match(faa, /nfdc\.faa\.gov\/webContent\/28DaySub\/extra/);
  assert.match(faa, /AWY_BASE/);
  assert.match(faa, /FIX_BASE/);
  assert.match(faa, /NAV_BASE/);
  assert.match(notams, /FAA_NMS_API_URL/);
  assert.match(notams, /FAA_NMS_API_KEY/);
  assert.doesNotMatch(notams, /notams\.aim\.faa\.gov/);
});

test('rail lookup uses official Amtrak GTFS and is explicitly scheduled not realtime', () => {
  assert.match(amtrak, /content\.amtrak\.com\/content\/gtfs\/GTFS\.zip/);
  assert.match(drawer, /SCHEDULED GTFS/);
  assert.match(drawer, /Realtime<\/dt><dd>No/);
});

test('mobility routes have a dedicated globe overlay separate from workspace tools', () => {
  assert.match(globe, /new C\.CustomDataSource\('mobility-center'\)/);
  assert.match(globe, /showMobilityPath/);
  assert.match(globe, /clearMobilityPath/);
  assert.match(drawer, /Turn-by-turn directions/);
  assert.match(drawer, /FAA airway explorer/);
  assert.match(drawer, /Amtrak schedule & route/);
});
