import { cachedSource, fetchProvider } from '@/lib/data/source-runtime';
import { parseTleCatalog } from '@/lib/intelligence/parsers';

const GROUPS = new Set(['STATIONS', 'GPS-OPS', 'WEATHER', 'SCIENCE', 'GEO', 'STARLINK']);

export async function GET(request: Request) {
  const requested = String(new URL(request.url).searchParams.get('group') || 'STATIONS').toUpperCase();
  const group = GROUPS.has(requested) ? requested : 'STATIONS';
  const sourceUrl = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=TLE`;
  try {
    const result = await cachedSource({ key: `intel:celestrak:${group}`, ttlMs: 60 * 60_000, staleMs: 24 * 60 * 60_000, loader: async () => {
      const response = await fetchProvider(sourceUrl, { headers: { Accept: 'text/plain', 'User-Agent': 'Atlas-Netic/2.0' } }, { timeoutMs: 15_000, retries: 2 });
      return parseTleCatalog(await response.text(), group).slice(0, group === 'STARLINK' ? 3000 : 2000);
    }});
    const phase = result.state === 'stale' ? 'stale' : 'live';
    return Response.json({ satellites: result.data, fetchedAt: result.fetchedAt, health: { id: 'satellites', label: 'Satellites', phase, message: result.error || 'Current CelesTrak GP elements; positions propagated in-browser with SGP4/SDP4', source: 'CelesTrak', coverage: `${group} catalog${group === 'STARLINK' && result.data.length >= 3000 ? ' · first 3,000 objects' : ''}`, updatedAt: result.fetchedAt, latencyMs: result.latencyMs, count: result.data.length, cache: result.cache, sourceUrl } }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=21600' } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Satellite catalog unavailable.' }, { status: 503 });
  }
}
