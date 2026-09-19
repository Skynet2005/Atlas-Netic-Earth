import { lookupNotams } from '@/lib/mobility/notams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const location = new URL(request.url).searchParams.get('location') || '';
    if (!location.trim()) return Response.json({ error: 'NOTAM location identifier is required.' }, { status: 400 });
    const result = await lookupNotams(location);
    return Response.json(result, {
      status: result.phase === 'not_configured' ? 503 : result.phase === 'unavailable' ? 502 : 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'FAA NOTAM data is unavailable.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
