import { cachedSource, fetchProvider } from '@/lib/data/source-runtime';
import { centroidOfCoordinates, parseViewQuery, severityFromWeather, timeOr } from '@/lib/intelligence/parsers';
import type { IntelligenceSignal } from '@/lib/intelligence/types';

const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'?value as Record<string,unknown>:{};

function parseAlerts(raw: unknown, center: { latitude: number; longitude: number }, now: number): IntelligenceSignal[] {
  const features = record(raw).features;
  if (!Array.isArray(features)) throw new Error('NWS response did not contain features.');
  return features.flatMap(item => {
    const feature=record(item),props=record(feature.properties),geometry=record(feature.geometry);
    const centroid = centroidOfCoordinates(geometry.coordinates) || center;
    const observedAt = timeOr(props.effective || props.sent || props.onset, now);
    const expiresAt = timeOr(props.ends || props.expires, observedAt + 6 * 60 * 60 * 1000);
    const id = String(feature.id || props.id || `${props.event}:${centroid.latitude}:${centroid.longitude}`);
    const sourceUrl=typeof feature.id==='string'?feature.id:'https://api.weather.gov/alerts';
    return [{
      id: `weather:${id}`, kind: 'weather' as const, name: String(props.event || props.headline || 'Weather alert'),
      latitude: centroid.latitude, longitude: centroid.longitude, altitude: 0, observedAt, expiresAt,
      source: 'NWS', sourceUrl, severity: severityFromWeather(props.severity), quality: 'reported' as const,
      details: { headline: String(props.headline || ''), area: String(props.areaDesc || ''), severity: String(props.severity || ''), urgency: String(props.urgency || ''), certainty: String(props.certainty || ''), instruction: String(props.instruction || '').slice(0, 600) },
    }];
  }).slice(0, 250);
}

export async function GET(request: Request) {
  let center;
  try { center = parseViewQuery(new URL(request.url).searchParams); }
  catch { return Response.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 }); }
  const providerUrl = `https://api.weather.gov/alerts/active?point=${center.latitude},${center.longitude}`;
  try {
    const result = await cachedSource({ key: `intel:nws:${center.latitude}:${center.longitude}`, ttlMs: 60_000, staleMs: 20 * 60_000, loader: async () => {
      const response = await fetchProvider(providerUrl, { headers: { Accept: 'application/geo+json', 'User-Agent': 'Atlas-Netic/2.0 (https://atlas-netic-earth.vercel.app)' } }, { timeoutMs: 10_000, retries: 2 });
      return parseAlerts(await response.json(), center, Date.now());
    }});
    const phase = result.state === 'stale' ? 'stale' : 'live';
    return Response.json({ signals: result.data, fetchedAt: result.fetchedAt, health: { id: 'weather', label: 'Weather alerts', phase, message: result.error || (result.data.length ? 'Active NWS alerts affecting the map center' : 'No active NWS alert affects this point'), source: 'NOAA / National Weather Service', coverage: 'United States and supported territories · map-center point query', updatedAt: result.fetchedAt, latencyMs: result.latencyMs, count: result.data.length, cache: result.cache, sourceUrl: 'https://api.weather.gov' } }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Weather alert feed unavailable.' }, { status: 503 });
  }
}
