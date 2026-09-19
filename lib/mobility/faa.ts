import { distanceKm, type GeoPoint } from '@/lib/geo';
import { normalizeId, numberOrNull, parseCsv, type CsvRecord } from '@/lib/mobility/csv';
import { fetchArchive, readZipEntry } from '@/lib/mobility/zip';
import type { AirwayRoute, AirwaySegment } from '@/lib/mobility/types';

const FAA_ROOT = 'https://nfdc.faa.gov/webContent/28DaySub/extra';
const CYCLE_ANCHOR = Date.UTC(2026, 8, 3);
const CYCLE_MS = 28 * 24 * 60 * 60 * 1000;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const cache = new Map<string, { expires: number; data: Promise<NasrData> }>();

type Location = GeoPoint & { id: string; state: string; country: string; icao: string };
type NasrData = {
  effectiveDate: string;
  base: CsvRecord[];
  segments: CsvRecord[];
  fixes: Map<string, Location[]>;
  navaids: Map<string, Location[]>;
};

function cycleDate(now = Date.now(), offset = 0) {
  const index = Math.floor((now - CYCLE_ANCHOR) / CYCLE_MS) + offset;
  return new Date(CYCLE_ANCHOR + Math.max(0, index) * CYCLE_MS);
}

export function formatNasrCycle(date: Date) {
  return `${String(date.getUTCDate()).padStart(2, '0')}_${MONTHS[date.getUTCMonth()]}_${date.getUTCFullYear()}`;
}

function isoCycle(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fileUrl(cycle: Date, group: 'AWY'|'FIX'|'NAV') {
  return `${FAA_ROOT}/${formatNasrCycle(cycle)}_${group}_CSV.zip`;
}

function locations(rows: CsvRecord[], kind: 'FIX'|'NAV') {
  const result = new Map<string, Location[]>();
  for (const row of rows) {
    const id = normalizeId(row[kind === 'FIX' ? 'FIX_ID' : 'NAV_ID'] || '');
    const latitude = numberOrNull(row.LAT_DECIMAL), longitude = numberOrNull(row.LONG_DECIMAL);
    if (!id || latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const value: Location = {
      id, latitude, longitude,
      state: normalizeId(row.STATE_CODE || ''),
      country: normalizeId(row.COUNTRY_CODE || ''),
      icao: normalizeId(row.ICAO_REGION_CODE || row.REGION_CODE || ''),
      name: id,
    };
    const current = result.get(id) || [];
    current.push(value); result.set(id, current);
  }
  return result;
}

function extract(buffer: Buffer, patterns: RegExp[]) {
  for (const pattern of patterns) {
    try { return readZipEntry(buffer, pattern); } catch { /* try schema-compatible filename */ }
  }
  throw new Error('FAA archive did not contain the expected CSV table.');
}

async function loadCycle(cycle: Date): Promise<NasrData> {
  const key = formatNasrCycle(cycle);
  const existing = cache.get(key);
  if (existing && existing.expires > Date.now()) return existing.data;
  const data = (async () => {
    const [awyZip, fixZip, navZip] = await Promise.all([
      fetchArchive(fileUrl(cycle, 'AWY')),
      fetchArchive(fileUrl(cycle, 'FIX')),
      fetchArchive(fileUrl(cycle, 'NAV')),
    ]);
    const base = parseCsv(extract(awyZip, [/AWY_BASE\.csv$/i]));
    const segments = parseCsv(extract(awyZip, [/AWY_SEG_ALT\.csv$/i, /AWY_SEG\.csv$/i, /AWY_ALT\.csv$/i]));
    const fixRows = parseCsv(extract(fixZip, [/FIX_BASE\.csv$/i]));
    const navRows = parseCsv(extract(navZip, [/NAV_BASE\.csv$/i]));
    return { effectiveDate: isoCycle(cycle), base, segments, fixes: locations(fixRows, 'FIX'), navaids: locations(navRows, 'NAV') };
  })();
  cache.set(key, { expires: Date.now() + 12 * 60 * 60 * 1000, data });
  try { return await data; } catch (error) { cache.delete(key); throw error; }
}

async function currentNasr() {
  let last: unknown;
  for (const offset of [0, -1]) {
    try { return await loadCycle(cycleDate(Date.now(), offset)); } catch (error) { last = error; }
  }
  throw last instanceof Error ? last : new Error('FAA NASR airway data is unavailable.');
}

function choose(candidates: Location[], previous: GeoPoint | null) {
  if (!candidates.length) return null;
  if (previous) return [...candidates].sort((a,b) =>
    distanceKm(previous.latitude, previous.longitude, a.latitude, a.longitude) -
    distanceKm(previous.latitude, previous.longitude, b.latitude, b.longitude)
  )[0];
  return candidates.find(item => item.country === 'US') || candidates[0];
}

function segmentValue(row: CsvRecord, names: string[]) {
  for (const name of names) if (row[name]?.trim()) return row[name].trim();
  return null;
}

function routeTokens(base: CsvRecord, rows: CsvRecord[]) {
  const direct = (base.AIRWAY_STRING || '').trim().split(/\s+/).map(normalizeId).filter(Boolean);
  if (direct.length > 1) return direct;
  const ordered = [...rows].sort((a,b) => (numberOrNull(a.POINT_SEQ) ?? 0) - (numberOrNull(b.POINT_SEQ) ?? 0));
  const tokens: string[] = [];
  for (const row of ordered) {
    for (const field of ['FROM_POINT','TO_POINT']) {
      const value = normalizeId(row[field] || '');
      if (value && tokens.at(-1) !== value) tokens.push(value);
    }
  }
  return tokens;
}

export async function lookupAirway(raw: string): Promise<AirwayRoute> {
  const airwayId = normalizeId(raw);
  if (!/^[A-Z0-9-]{1,12}$/.test(airwayId)) throw new Error('Enter an FAA airway identifier such as V16, J75 or Q40.');
  const data = await currentNasr();
  const base = data.base.find(row => normalizeId(row.AWY_ID || '') === airwayId);
  if (!base) throw new Error(`FAA NASR has no airway named ${airwayId} in the current cycle.`);
  const rows = data.segments.filter(row => normalizeId(row.AWY_ID || '') === airwayId);
  const tokens = routeTokens(base, rows);
  const points: GeoPoint[] = [], unresolvedPoints: string[] = [];
  let previous: GeoPoint | null = null;
  for (const token of tokens) {
    const candidates = [...(data.fixes.get(token) || []), ...(data.navaids.get(token) || [])];
    const point = choose(candidates, previous);
    if (!point) { if (!unresolvedPoints.includes(token)) unresolvedPoints.push(token); continue; }
    points.push({ latitude: point.latitude, longitude: point.longitude, name: token });
    previous = point;
  }
  if (points.length < 2) throw new Error(`${airwayId} was found, but its navigation points could not be resolved from this NASR cycle.`);
  const segments: AirwaySegment[] = [...rows]
    .sort((a,b) => (numberOrNull(a.POINT_SEQ) ?? 0) - (numberOrNull(b.POINT_SEQ) ?? 0))
    .slice(0, 500)
    .map((row, index) => ({
      sequence: numberOrNull(row.POINT_SEQ) ?? index * 10,
      from: row.FROM_POINT?.trim() || '',
      to: row.TO_POINT?.trim() || '',
      minimumEnrouteAltitude: segmentValue(row, ['MIN_ENROUTE_ALT','MEA','MIN_ALTITUDE','MIN_ALT']),
      maximumAuthorizedAltitude: segmentValue(row, ['MAX_AUTH_ALT','MAA','MAX_ALTITUDE','MAX_ALT']),
    }));
  return {
    mode: 'air',
    provider: 'FAA NASR',
    airwayId,
    effectiveDate: data.effectiveDate,
    remark: (base.REMARK || '').trim().slice(0, 1500),
    points,
    segments,
    unresolvedPoints,
    sourceUrl: `https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/${data.effectiveDate}/`,
    generatedAt: Date.now(),
  };
}
