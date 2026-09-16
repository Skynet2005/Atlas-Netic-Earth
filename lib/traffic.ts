export type TrafficKind = 'air' | 'military' | 'maritime';
export type TrafficTarget = {
  id: string; kind: TrafficKind; name: string; registration?: string; aircraftType?: string; squawk?: string; verticalRate?: number | null; latitude: number; longitude: number;
  altitude: number | null; altitudeReference: 'geometric' | 'barometric' | 'surface' | 'unknown';
  headingReference?: 'true heading' | 'course over ground' | 'unknown'; speed: number | null; heading: number | null; observedAt: number; source: string;
};
export type TrafficSnapshot = {
  targets: TrafficTarget[]; fetchedAt: number; source: string; coverage: string; limited?: boolean;
};
export type TrafficLayers = Record<TrafficKind, boolean>;
export const AIR_MAX_AGE = 90_000;
export const SHIP_MAX_AGE = 15 * 60_000;
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const text = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 60) : '';
const heading = (v: unknown) => { const n = number(v); return n !== null && n >= 0 && n < 360 ? n : null; };
const coordinates = (lat: unknown, lon: unknown) => number(lat) !== null && number(lon) !== null && Math.abs(lat as number) <= 90 && Math.abs(lon as number) <= 180;
export const isFreshTarget = (t: TrafficTarget, now = Date.now()) => now - t.observedAt <= (t.kind === 'maritime' ? SHIP_MAX_AGE : AIR_MAX_AGE) && t.observedAt <= now + 10_000;

export function parseAircraft(payload: unknown, now = Date.now()): TrafficTarget[] {
  const data = record(payload);
  if (!Array.isArray(data.ac)) throw new Error('Invalid aircraft feed');
  const timestamp = number(data.now);
  if (timestamp === null) throw new Error('Aircraft timestamp missing');
  const epoch = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const targets = new Map<string, TrafficTarget>();
  for (const item of data.ac) {
    const a = record(item), age = number(a.seen_pos), id = text(a.hex);
    if (!id || age === null || age < 0 || !coordinates(a.lat, a.lon)) continue;
    const geometric = number(a.alt_geom), barometric = number(a.alt_baro);
    const ground = a.alt_baro === 'ground';
    const height = geometric ?? barometric;
    const flags = number(a.dbFlags) ?? 0;
    const target: TrafficTarget = {
      id: `air:${id}`, kind: (flags & 1) === 1 ? 'military' : 'air',
      name: text(a.flight) || text(a.r) || id.toUpperCase(), registration:text(a.r), aircraftType:text(a.t), squawk:text(a.squawk), verticalRate:number(a.geom_rate)??number(a.baro_rate), latitude: a.lat as number, longitude: a.lon as number,
      altitude: ground ? 0 : height === null ? null : height * 0.3048,
      altitudeReference: ground ? 'surface' : geometric !== null ? 'geometric' : barometric !== null ? 'barometric' : 'unknown',
      speed: number(a.gs), heading: heading(a.true_heading) ?? heading(a.track), headingReference: heading(a.true_heading)!==null?'true heading':heading(a.track)!==null?'course over ground':'unknown', observedAt: epoch - age * 1000, source: 'ADSB.lol',
    };
    if (isFreshTarget(target, now)) targets.set(target.id, target);
  }
  return [...targets.values()];
}

export function parseVessels(payload: unknown, now = Date.now()): TrafficTarget[] {
  const data = record(payload);
  if (!Array.isArray(data.features)) throw new Error('Invalid vessel feed');
  const targets = new Map<string, TrafficTarget>();
  for (const item of data.features) {
    const feature = record(item), geometry = record(feature.geometry), p = record(feature.properties);
    const coords = geometry.coordinates;
    if (geometry.type !== 'Point' || !Array.isArray(coords) || !coordinates(coords[1], coords[0])) continue;
    const mmsi = String(p.mmsi ?? ''), timestamp = number(p.timestampExternal) ?? number(p.timestamp);
    if (!/^\d{9}$/.test(mmsi) || timestamp === null) continue;
    const speed = number(p.sog);
    const target: TrafficTarget = {
      id: `ship:${mmsi}`, kind: 'maritime', name: text(p.name) || `MMSI ${mmsi}`,
      longitude: coords[0], latitude: coords[1], altitude: 0, altitudeReference: 'surface',
      speed: speed !== null && speed < 102.3 && speed >= 0 ? speed : null,
      heading: heading(p.heading) ?? heading(p.cog), headingReference:heading(p.heading)!==null?'true heading':heading(p.cog)!==null?'course over ground':'unknown',
      observedAt: timestamp < 1e12 ? timestamp * 1000 : timestamp, source: 'Fintraffic / Digitraffic',
    };
    if (isFreshTarget(target, now)) targets.set(target.id, target);
  }
  return [...targets.values()];
}

export function parseAISMessage(payload: unknown, now = Date.now()): TrafficTarget | null {
  const data = record(payload), meta = record(data.MetaData), message = record(record(data.Message)[String(data.MessageType)]);
  const latitude = number(message.Latitude) ?? number(meta.latitude), longitude = number(message.Longitude) ?? number(meta.longitude);
  const mmsi = String(meta.MMSI ?? message.UserID ?? '');
  if (!coordinates(latitude, longitude) || !/^\d{9}$/.test(mmsi)) return null;
  // AISStream's timestamp is a Go-formatted UTC time rather than ISO 8601.
  const stamp = text(meta.time_utc).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/);
  if (!stamp) return null;
  const observedAt = Date.parse(`${stamp[1]}T${stamp[2]}.${(stamp[3] || '').padEnd(3, '0').slice(0, 3)}Z`);
  const speed = number(message.Sog);
  const target: TrafficTarget = { id: `ship:${mmsi}`, kind: 'maritime', name: text(meta.ShipName) || `MMSI ${mmsi}`,
    latitude: latitude!, longitude: longitude!, altitude: 0, altitudeReference: 'surface',
    speed: speed !== null && speed < 102.3 && speed >= 0 ? speed : null,
    heading: heading(message.TrueHeading) ?? heading(message.Cog), headingReference:heading(message.TrueHeading)!==null?'true heading':heading(message.Cog)!==null?'course over ground':'unknown', observedAt, source: 'AISStream' };
  return Number.isFinite(observedAt) && isFreshTarget(target, now) ? target : null;
}

export function parseTrafficQuery(params: URLSearchParams) {
  const lat = params.get('lat'), lon = params.get('lon');
  if (!lat?.trim() || !lon?.trim() || !coordinates(Number(lat), Number(lon))) throw new Error('Valid latitude and longitude are required.');
  // Shared geographic buckets prevent a new upstream query for every pixel of camera movement.
  return { latitude: Math.round(Number(lat) * 4) / 4, longitude: Math.round(Number(lon) * 4) / 4 };
}

export function aisBoundingBoxes(latitude: number, longitude: number) {
  const south = Math.max(-90, latitude - 4.2), north = Math.min(90, latitude + 4.2);
  const span = Math.min(180, 4.2 / Math.max(0.05, Math.cos(latitude * Math.PI / 180)));
  const west = longitude - span, east = longitude + span;
  if (west < -180) return [[[south, west + 360], [north, 180]], [[south, -180], [north, east]]];
  if (east > 180) return [[[south, west], [north, 180]], [[south, -180], [north, east - 360]]];
  return [[[south, west], [north, east]]];
}
