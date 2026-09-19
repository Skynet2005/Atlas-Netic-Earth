import { lookupAirway } from '@/lib/mobility/faa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const airway = new URL(request.url).searchParams.get('airway') || '';
    if (!airway.trim()) return Response.json({ error: 'Airway identifier is required.' }, { status: 400 });
    return Response.json(await lookupAirway(airway), {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=43200' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'FAA airway data is unavailable.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
