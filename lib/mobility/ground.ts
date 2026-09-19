import type { GeoPoint } from '@/lib/geo';
import type { DirectionStep, GroundAvoid, GroundProfile, GroundRoute } from '@/lib/mobility/types';

const API = 'https://api.heigit.org';
const PROFILES = new Set<GroundProfile>(['driving-car', 'foot-walking', 'cycling-regular']);
const AVOIDS = new Set<GroundAvoid>(['tollways', 'highways', 'ferries']);

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike => value && typeof value === 'object' ? value as RecordLike : {};
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function coordinateText(input: string): GeoPoint | null {
  const match = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]), longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude, name: input.trim() };
}

async function jsonRequest(url: string, init: RequestInit, timeoutMs = 18_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const body = await response.text();
    let parsed: unknown;
    try { parsed = JSON.parse(body); } catch { parsed = { error: body.slice(0, 300) }; }
    if (!response.ok) {
      const message = text(record(parsed).error) || text(record(parsed).message) || `Routing provider returned HTTP ${response.status}.`;
      throw new Error(message);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(input: string, apiKey: string): Promise<GeoPoint> {
  const coordinates = coordinateText(input);
  if (coordinates) return coordinates;
  const query = input.trim();
  if (!query || query.length > 180) throw new Error('Enter a place name or latitude, longitude.');
  const params = new URLSearchParams({ text: query, size: '1', api_key: apiKey });
  const payload = record(await jsonRequest(`${API}/pelias/v1/search?${params}`, { headers: { Accept: 'application/json' } }));
  const features = Array.isArray(payload.features) ? payload.features : [];
  const feature = record(features[0]), geometry = record(feature.geometry), properties = record(feature.properties);
  const pair = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const longitude = finite(pair[0]), latitude = finite(pair[1]);
  if (latitude === null || longitude === null) throw new Error(`No routable place found for “${query}”.`);
  return { latitude, longitude, name: text(properties.label) || query };
}

function decimate(points: GeoPoint[], maximum = 2500) {
  if (points.length <= maximum) return points;
  const stride = (points.length - 1) / (maximum - 1);
  return Array.from({ length: maximum }, (_, index) => points[Math.round(index * stride)]);
}

export async function groundDirections(input: {
  origin: string;
  destination: string;
  profile?: GroundProfile;
  avoid?: GroundAvoid[];
}): Promise<GroundRoute> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) throw new Error('Ground routing is ready but OPENROUTESERVICE_API_KEY is not configured on the server.');
  const profile = input.profile && PROFILES.has(input.profile) ? input.profile : 'driving-car';
  const avoided = profile === 'driving-car' ? (input.avoid || []).filter((value): value is GroundAvoid => AVOIDS.has(value)) : [];
  const [origin, destination] = await Promise.all([geocode(input.origin, apiKey), geocode(input.destination, apiKey)]);
  const body: RecordLike = {
    coordinates: [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]],
    instructions: true,
    instructions_format: 'text',
  };
  if (avoided.length) body.options = { avoid_features: avoided };
  const payload = record(await jsonRequest(
    `${API}/openrouteservice/v2/directions/${profile}/geojson`,
    {
      method: 'POST',
      headers: { Authorization: apiKey, Accept: 'application/geo+json, application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  ));
  const feature = record(Array.isArray(payload.features) ? payload.features[0] : null);
  const geometry = record(feature.geometry), properties = record(feature.properties), summary = record(properties.summary);
  const rawCoordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
  const points = rawCoordinates.flatMap(value => {
    if (!Array.isArray(value)) return [];
    const longitude = finite(value[0]), latitude = finite(value[1]);
    return longitude === null || latitude === null ? [] : [{ latitude, longitude }];
  });
  if (points.length < 2) throw new Error('Routing provider returned no usable route geometry.');
  const segments = Array.isArray(properties.segments) ? properties.segments : [];
  const steps: DirectionStep[] = segments.flatMap(segment => {
    const source = record(segment);
    return (Array.isArray(source.steps) ? source.steps : []).map(value => {
      const step = record(value), way = Array.isArray(step.way_points) ? step.way_points : [];
      return {
        instruction: text(step.instruction) || 'Continue',
        name: text(step.name),
        distanceMeters: finite(step.distance) ?? 0,
        durationSeconds: finite(step.duration) ?? 0,
        type: finite(step.type),
        wayPoints: way.length >= 2 && finite(way[0]) !== null && finite(way[1]) !== null ? [Number(way[0]), Number(way[1])] as [number, number] : null,
      };
    });
  });
  return {
    mode: 'ground',
    provider: 'HeiGIT openrouteservice',
    profile,
    origin,
    destination,
    distanceMeters: finite(summary.distance) ?? 0,
    durationSeconds: finite(summary.duration) ?? 0,
    points: decimate(points),
    steps,
    avoided,
    generatedAt: Date.now(),
  };
}
