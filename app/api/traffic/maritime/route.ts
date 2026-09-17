import { cachedSource, fetchProvider } from '@/lib/data/source-runtime';
import { parseTrafficQuery, parseVessels } from '@/lib/traffic';
import { readAISStream } from '@/lib/aisstream';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  let center;
  try { center = parseTrafficQuery(new URL(request.url).searchParams); }
  catch { return Response.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 }); }
  const globalFeed = Boolean(process.env.AISSTREAM_API_KEY);
  try {
    const ttl = globalFeed ? 30_000 : 60_000;
    const result = await cachedSource({ key: `traffic:maritime:${globalFeed ? 'aisstream' : 'digitraffic'}:${center.latitude}:${center.longitude}`, ttlMs: ttl, staleMs: 20 * 60_000, loader: async () => globalFeed
      ? readAISStream(process.env.AISSTREAM_API_KEY!, center.latitude, center.longitude)
      : (async () => {
          const response = await fetchProvider(`https://meri.digitraffic.fi/api/ais/v1/locations?latitude=${center.latitude}&longitude=${center.longitude}&radius=463`, { headers: { Accept: 'application/geo+json', 'Accept-Encoding': 'gzip', 'Digitraffic-User': 'Atlas-Netic' } }, { timeoutMs: 12_000, retries: 2 });
          return parseVessels(await response.json()).slice(0, 1500);
        })()
    });
    const coverage = result.state === 'stale' ? 'Provider unavailable; retained last server snapshot within stale window' : globalFeed ? 'AIS receiver coverage near the view center; partial live sample' : 'Finnish waters and nearby Baltic reception only';
    return Response.json({ targets: result.data, fetchedAt: result.fetchedAt, source: globalFeed ? 'AISStream' : 'Fintraffic / Digitraffic', limited: !globalFeed, degraded: result.state === 'stale', cache: result.cache, coverage }, { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${globalFeed ? 30 : 60}, stale-while-revalidate=600` } });
  } catch {
    return Response.json({ error: 'Maritime feed temporarily unavailable. Retrying automatically.', limited: !globalFeed }, { status: 503, headers: { 'Retry-After': '45' } });
  }
}
