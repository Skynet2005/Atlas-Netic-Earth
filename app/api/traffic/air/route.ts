import { parseAircraft, parseTrafficQuery } from '@/lib/traffic';

export async function GET(request: Request) {
  let center;
  try { center = parseTrafficQuery(new URL(request.url).searchParams); }
  catch { return Response.json({ error: 'Valid latitude and longitude are required.' }, { status: 400 }); }
  try {
    const response = await fetch(`https://api.adsb.lol/v2/point/${center.latitude}/${center.longitude}/250`, {
      next: { revalidate: 15 }, signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json', 'User-Agent': 'Atlas-Netic/1.0' },
    });
    if (!response.ok) throw new Error('Aircraft feed unavailable');
    const targets = parseAircraft(await response.json());
    return Response.json({ targets, fetchedAt: Date.now(), source: 'ADSB.lol', coverage: 'Within 250 nautical miles of the view center' },
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=15' } });
  } catch {
    return Response.json({ error: 'Aircraft feed temporarily unavailable. Retrying automatically.' }, { status: 503 });
  }
}
