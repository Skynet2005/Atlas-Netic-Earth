import { cachedSource, fetchProvider } from '@/lib/data/source-runtime';
import { boxesAround, centroidOfCoordinates, finiteNumber, parseCsv, parseViewQuery, timeOr } from '@/lib/intelligence/parsers';
import type { IntelligenceSignal, SourceHealth } from '@/lib/intelligence/types';

const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'?value as Record<string,unknown>:{};
function fireTime(date: string, time: string) {
  const padded = time.padStart(4, '0');
  return Date.parse(`${date}T${padded.slice(0, 2)}:${padded.slice(2)}:00Z`);
}

async function firms(center: { latitude: number; longitude: number }) {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) throw new Error('FIRMS_MAP_KEY is not configured.');
  const rows = (await Promise.all(boxesAround(center.latitude, center.longitude).map(async box => {
    const area = `${box.west.toFixed(3)},${box.south.toFixed(3)},${box.east.toFixed(3)},${box.north.toFixed(3)}`;
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_NOAA21_NRT/${area}/1`;
    const response = await fetchProvider(url, { headers: { 'User-Agent': 'Atlas-Netic/2.0' } }, { timeoutMs: 12_000, retries: 1 });
    return parseCsv(await response.text());
  }))).flat();
  const dedupe = new Map<string, IntelligenceSignal>();
  for (const row of rows) {
    const latitude = finiteNumber(row.latitude), longitude = finiteNumber(row.longitude);
    if (latitude === null || longitude === null) continue;
    const observedAt = fireTime(row.acq_date || '', row.acq_time || '') || Date.now();
    const frp = finiteNumber(row.frp);
    const id = `fire:firms:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${observedAt}`;
    dedupe.set(id, { id, kind: 'fires', name: `VIIRS thermal detection${frp === null ? '' : ` · ${frp.toFixed(1)} MW`}`, latitude, longitude, altitude: 0, observedAt, expiresAt: observedAt + 24 * 60 * 60 * 1000, source: 'NASA FIRMS · VIIRS NOAA-21 NRT', sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/', severity: frp !== null && frp >= 100 ? 'severe' : frp !== null && frp >= 30 ? 'moderate' : 'minor', quality: 'reported', details: { satellite: row.satellite || 'NOAA-21', instrument: row.instrument || 'VIIRS', confidence: row.confidence || null, frpMw: frp, daynight: row.daynight || null, brightTi4: finiteNumber(row.bright_ti4) } });
  }
  return [...dedupe.values()].sort((a, b) => b.observedAt - a.observedAt).slice(0, 1200);
}

async function eonet(center: { latitude: number; longitude: number }) {
  const events = (await Promise.all(boxesAround(center.latitude, center.longitude).map(async box => {
    const bbox = `${box.west.toFixed(3)},${box.north.toFixed(3)},${box.east.toFixed(3)},${box.south.toFixed(3)}`;
    const response = await fetchProvider(`https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=300&bbox=${bbox}`, { headers: { Accept: 'application/json', 'User-Agent': 'Atlas-Netic/2.0' } }, { timeoutMs: 10_000, retries: 2 });
    const payload=record(await response.json());
    return Array.isArray(payload.events)?payload.events:[];
  }))).flat();
  const dedupe = new Map<string, IntelligenceSignal>();
  for (const item of events) {
    const event=record(item),geometries=Array.isArray(event.geometry)?event.geometry.map(record):[];
    const geometry=[...geometries].sort((a,b)=>Date.parse(String(b.date||''))-Date.parse(String(a.date||'')))[0];
    if(!geometry)continue;
    const coordinates=geometry.coordinates;
    const centroid = geometry.type === 'Point' && Array.isArray(coordinates)
      ? { longitude: Number(coordinates[0]), latitude: Number(coordinates[1]) }
      : centroidOfCoordinates(coordinates);
    if (!centroid || !Number.isFinite(centroid.latitude) || !Number.isFinite(centroid.longitude)) continue;
    const observedAt = timeOr(geometry.date, Date.now());
    const id = `fire:eonet:${String(event.id || `${centroid.latitude}:${centroid.longitude}`)}`;
    const sources=Array.isArray(event.sources)?event.sources:[];
    dedupe.set(id, { id, kind: 'fires', name: String(event.title || 'Wildfire event'), latitude: centroid.latitude, longitude: centroid.longitude, altitude: 0, observedAt, expiresAt: observedAt + 7 * 24 * 60 * 60 * 1000, source: 'NASA EONET', sourceUrl: String(event.link || 'https://eonet.gsfc.nasa.gov/'), severity: 'moderate', quality: 'fallback', details: { description: String(event.description || '').slice(0, 500), magnitude: finiteNumber(event.magnitudeValue), magnitudeUnit: String(event.magnitudeUnit || ''), sourceCount: sources.length } });
  }
  return [...dedupe.values()].slice(0, 500);
}

export async function GET(request: Request) {
  let center;
  try { center = parseViewQuery(new URL(request.url).searchParams); }
  catch { return Response.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 }); }
  const hasFirms = Boolean(process.env.FIRMS_MAP_KEY);
  try {
    if (hasFirms) {
      try {
        const primary = await cachedSource({ key: `intel:firms:${center.latitude}:${center.longitude}`, ttlMs: 5 * 60_000, staleMs: 30 * 60_000, loader: () => firms(center) });
        const health: SourceHealth = { id: 'fires', label: 'Active fires', phase: primary.state === 'stale' ? 'stale' : 'live', message: primary.error || 'Near-real-time VIIRS thermal detections', source: 'NASA FIRMS', coverage: 'Map-centered regional query · VIIRS NOAA-21 NRT', updatedAt: primary.fetchedAt, latencyMs: primary.latencyMs, count: primary.data.length, cache: primary.cache, sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/' };
        return Response.json({ signals: primary.data, fetchedAt: primary.fetchedAt, health }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=900' } });
      } catch { /* use EONET fallback below */ }
    }
    const fallback = await cachedSource({ key: `intel:eonet:${center.latitude}:${center.longitude}`, ttlMs: 10 * 60_000, staleMs: 60 * 60_000, loader: () => eonet(center) });
    const health: SourceHealth = { id: 'fires', label: 'Active fires', phase: fallback.state === 'stale' ? 'stale' : 'fallback', message: hasFirms ? 'FIRMS unavailable; showing NASA EONET wildfire events.' : 'Showing NASA EONET wildfire events. Add FIRMS_MAP_KEY for thermal detections.', source: 'NASA EONET', coverage: 'Open wildfire events near the map center', updatedAt: fallback.fetchedAt, latencyMs: fallback.latencyMs, count: fallback.data.length, cache: fallback.cache, sourceUrl: 'https://eonet.gsfc.nasa.gov/' };
    return Response.json({ signals: fallback.data, fetchedAt: fallback.fetchedAt, health }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=1800' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Fire feed unavailable.' }, { status: 503 });
  }
}
