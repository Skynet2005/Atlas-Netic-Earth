import { cachedSource, fetchProvider } from '@/lib/data/source-runtime';
import { finiteNumber, severityFromMagnitude, timeOr } from '@/lib/intelligence/parsers';
import type { IntelligenceSignal } from '@/lib/intelligence/types';

const SOURCE_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

function parseFeed(raw: unknown, now: number): IntelligenceSignal[] {
  const features = (raw as { features?: unknown[] })?.features;
  if (!Array.isArray(features)) throw new Error('USGS response did not contain features.');
  return features.flatMap((feature: any) => {
    const coordinates = feature?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) return [];
    const longitude = finiteNumber(coordinates[0]), latitude = finiteNumber(coordinates[1]), depthKm = finiteNumber(coordinates[2]);
    if (longitude === null || latitude === null || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return [];
    const magnitude = finiteNumber(feature?.properties?.mag) ?? 0;
    const observedAt = timeOr(feature?.properties?.time, now);
    return [{
      id: `quake:${String(feature?.id || `${latitude}:${longitude}:${observedAt}`)}`, kind: 'earthquakes' as const,
      name: String(feature?.properties?.place || `M${magnitude.toFixed(1)} earthquake`), latitude, longitude, altitude: 0,
      observedAt, expiresAt: observedAt + 24 * 60 * 60 * 1000, source: 'USGS', sourceUrl: feature?.properties?.url || SOURCE_URL,
      severity: severityFromMagnitude(magnitude), quality: 'reported' as const,
      details: { magnitude, depthKm, felt: finiteNumber(feature?.properties?.felt), tsunami: Boolean(feature?.properties?.tsunami), significance: finiteNumber(feature?.properties?.sig), status: String(feature?.properties?.status || '') },
    }];
  }).sort((a, b) => b.observedAt - a.observedAt).slice(0, 800);
}

export async function GET() {
  try {
    const result = await cachedSource({ key: 'intel:usgs:all-day', ttlMs: 55_000, staleMs: 15 * 60_000, loader: async () => {
      const response = await fetchProvider(SOURCE_URL, { headers: { Accept: 'application/geo+json', 'User-Agent': 'Atlas-Netic/2.0' } }, { timeoutMs: 10_000, retries: 2 });
      return parseFeed(await response.json(), Date.now());
    }});
    const phase = result.state === 'stale' ? 'stale' : 'live';
    return Response.json({ signals: result.data, fetchedAt: result.fetchedAt, health: { id: 'earthquakes', label: 'Earthquakes', phase, message: result.error || 'USGS real-time GeoJSON feed', source: 'USGS', coverage: 'Global · past 24 hours', updatedAt: result.fetchedAt, latencyMs: result.latencyMs, count: result.data.length, cache: result.cache, sourceUrl: SOURCE_URL } }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=55, stale-while-revalidate=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Earthquake feed unavailable.' }, { status: 503 });
  }
}
