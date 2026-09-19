import { groundDirections } from '@/lib/mobility/ground';
import type { GroundAvoid, GroundProfile } from '@/lib/mobility/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Body = {
  origin?: unknown;
  destination?: unknown;
  profile?: unknown;
  avoid?: unknown;
};

const profiles = new Set<GroundProfile>(['driving-car','foot-walking','cycling-regular']);
const avoids = new Set<GroundAvoid>(['tollways','highways','ferries']);

export async function POST(request: Request) {
  try {
    const body = await request.json() as Body;
    const origin = typeof body.origin === 'string' ? body.origin.trim() : '';
    const destination = typeof body.destination === 'string' ? body.destination.trim() : '';
    if (!origin || !destination) return Response.json({ error: 'Origin and destination are required.' }, { status: 400 });
    const profile = typeof body.profile === 'string' && profiles.has(body.profile as GroundProfile) ? body.profile as GroundProfile : 'driving-car';
    const avoid = Array.isArray(body.avoid) ? body.avoid.filter((value): value is GroundAvoid => typeof value === 'string' && avoids.has(value as GroundAvoid)) : [];
    return Response.json(await groundDirections({ origin, destination, profile, avoid }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Directions are unavailable.';
    const status = message.includes('OPENROUTESERVICE_API_KEY') ? 503 : 502;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
