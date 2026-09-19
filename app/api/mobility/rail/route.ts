import { lookupAmtrak } from '@/lib/mobility/amtrak';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get('query') || '';
    const date = params.get('date') || '';
    const tripId = params.get('tripId') || undefined;
    if (!query.trim() || !date.trim()) return Response.json({ error: 'Train or route and service date are required.' }, { status: 400 });
    return Response.json(await lookupAmtrak({ query, date, tripId }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Amtrak schedule data is unavailable.' }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
