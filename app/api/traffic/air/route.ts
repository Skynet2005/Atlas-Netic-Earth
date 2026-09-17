import { cachedSource, fetchProvider } from '@/lib/data/source-runtime';
import { parseAircraft, parseTrafficQuery } from '@/lib/traffic';

export async function GET(request: Request) {
  let center;
  try { center = parseTrafficQuery(new URL(request.url).searchParams); }
  catch { return Response.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 }); }
  try {
    const result = await cachedSource({ key: `traffic:air:${center.latitude}:${center.longitude}`, ttlMs: 15_000, staleMs: 120_000, loader: async () => {
      const response = await fetchProvider(`https://api.adsb.lol/v2/point/${center.latitude}/${center.longitude}/250`, { headers: { Accept: 'application/json', 'User-Agent': 'Atlas-Netic/2.0' } }, { timeoutMs: 10_000, retries: 2 });
      return parseAircraft(await response.json());
    }});
    return Response.json({ targets: result.data, fetchedAt: result.fetchedAt, source: 'ADSB.lol', coverage: result.state === 'stale' ? 'Provider unavailable; retained last server snapshot within stale window' : 'Within 250 nautical miles of the view center', degraded: result.state === 'stale', cache: result.cache }, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=15, stale-while-revalidate=90' } });
  } catch {
    return Response.json({ error: 'Aircraft feed temporarily unavailable. Retrying automatically.' }, { status: 503, headers: { 'Retry-After': '15' } });
  }
}
