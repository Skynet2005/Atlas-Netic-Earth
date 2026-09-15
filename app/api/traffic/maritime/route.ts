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
    const targets = globalFeed
      ? await readAISStream(process.env.AISSTREAM_API_KEY!, center.latitude, center.longitude)
      : await (async () => {
        const response = await fetch(`https://meri.digitraffic.fi/api/ais/v1/locations?latitude=${center.latitude}&longitude=${center.longitude}&radius=463`, {
          next: { revalidate: 60 }, signal: AbortSignal.timeout(12_000),
          headers: { Accept: 'application/geo+json', 'Accept-Encoding': 'gzip', 'Digitraffic-User': 'Atlas-Netic' },
        });
        if (!response.ok) throw new Error('AIS feed unavailable');
        return parseVessels(await response.json()).slice(0, 1500);
      })();
    return Response.json({ targets, fetchedAt: Date.now(), source: globalFeed ? 'AISStream' : 'Fintraffic / Digitraffic',
      limited: !globalFeed, coverage: globalFeed ? 'AIS receiver coverage near the view center; partial live sample' : 'Finnish waters and nearby Baltic reception only' },
      { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${globalFeed ? 30 : 60}` } });
  } catch {
    return Response.json({ error: 'Maritime feed temporarily unavailable. Retrying automatically.', limited: !globalFeed }, { status: 503 });
  }
}
