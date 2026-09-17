export type TrafficKind = 'air' | 'military' | 'maritime';
export type VesselClass = 'generic'|'passenger'|'cargo'|'tanker'|'tug'|'sailing'|'military'|'service';
export type TrafficTarget = {
  id: string; kind: TrafficKind; name: string; registration?: string; aircraftType?: string; squawk?: string; verticalRate?: number | null; latitude: number; longitude: number;
  altitude: number | null; altitudeReference: 'geometric' | 'barometric' | 'surface' | 'unknown';
  headingReference?: 'true heading' | 'course over ground' | 'unknown'; speed: number | null; heading: number | null; observedAt: number; source: string;
  vesselType?: number | null; vesselClass?: VesselClass; callSign?: string; imo?: number | null; destination?: string;
  lengthMeters?: number | null; beamMeters?: number | null;
};
export type TrafficSnapshot = {
  targets: TrafficTarget[]; fetchedAt: number; source: string; coverage: string; limited?: boolean;
};
export type TrafficLayers = Record<TrafficKind, boolean>;
export type VesselMetadata = {mmsi:string;name:string;type:number|null;callSign:string;imo:number|null;destination:string;lengthMeters:number|null;beamMeters:number|null};
export const AIR_MAX_AGE = 90_000;
export const SHIP_MAX_AGE = 15 * 60_000;
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const number = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const numeric = (v: unknown): number | null => {const n=typeof v==='string'&&v.trim()?Number(v):number(v);return n!==null&&Number.isFinite(n)?n:null;};
const text = (v: unknown) => typeof v === 'string' ? v.trim().slice(0, 80) : '';
const heading = (v: unknown) => { const n = number(v); return n !== null && n >= 0 && n < 360 ? n : null; };
const coordinates = (lat: unknown, lon: unknown) => number(lat) !== null && number(lon) !== null && Math.abs(lat as number) <= 90 && Math.abs(lon as number) <= 180;
export const isFreshTarget = (t: TrafficTarget, now = Date.now()) => now - t.observedAt <= (t.kind === 'maritime' ? SHIP_MAX_AGE : AIR_MAX_AGE) && t.observedAt <= now + 10_000;

export function vesselClassFromType(type:number|null|undefined):VesselClass{
 if(type===35)return'military'; if(type===36)return'sailing'; if(type===31||type===32||type===52)return'tug';
 if(type===60)return'passenger'; if(type===70)return'cargo'; if(type===80)return'tanker';
 if(type!==null&&type!==undefined&&((type>=50&&type<=59)||type===33||type===34||type===37||type===40||type===90))return'service';
 return'generic';
}

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
    const vesselType=numeric(p.type);
    const target: TrafficTarget = {
      id: `ship:${mmsi}`, kind: 'maritime', name: text(p.name) || `MMSI ${mmsi}`,
      longitude: coords[0], latitude: coords[1], altitude: 0, altitudeReference: 'surface',
      speed: speed !== null && speed < 102.3 && speed >= 0 ? speed : null,
      heading: heading(p.heading) ?? heading(p.cog), headingReference:heading(p.heading)!==null?'true heading':heading(p.cog)!==null?'course over ground':'unknown',
      observedAt: timestamp < 1e12 ? timestamp * 1000 : timestamp, source: 'Fintraffic / Digitraffic',
      vesselType,vesselClass:vesselClassFromType(vesselType),callSign:text(p.callSign),imo:numeric(p.imo),destination:text(p.destination),
    };
    if (isFreshTarget(target, now)) targets.set(target.id, target);
  }
  return [...targets.values()];
}

function metadataRecords(payload:unknown):Record<string,unknown>[] {
 if(Array.isArray(payload))return payload.map(record);
 const root=record(payload);
 if(Array.isArray(root.vessels))return root.vessels.map(record);
 return Object.entries(root).flatMap(([key,value])=>{const item=record(value);return /^\d{9}$/.test(key)?[{...item,mmsi:item.mmsi??key}]:[];});
}
export function parseVesselMetadata(payload:unknown):Map<string,VesselMetadata>{
 const result=new Map<string,VesselMetadata>();
 for(const item of metadataRecords(payload)){
  const mmsi=String(item.mmsi??item.MMSI??'');if(!/^\d{9}$/.test(mmsi))continue;
  const refA=numeric(item.refA),refB=numeric(item.refB),refC=numeric(item.refC),refD=numeric(item.refD),type=numeric(item.type);
  result.set(mmsi,{mmsi,name:text(item.name),type,callSign:text(item.callSign),imo:numeric(item.imo),destination:text(item.destination),lengthMeters:refA!==null&&refB!==null?refA+refB:null,beamMeters:refC!==null&&refD!==null?refC+refD:null});
 }
 return result;
}
export function enrichVessels(targets:TrafficTarget[],metadata:Map<string,VesselMetadata>):TrafficTarget[]{
 return targets.map(target=>{
  if(target.kind!=='maritime')return target;const info=metadata.get(target.id.slice(5));if(!info)return target;
  return {...target,name:info.name||target.name,vesselType:info.type,vesselClass:vesselClassFromType(info.type),callSign:info.callSign||target.callSign,imo:info.imo,destination:info.destination||target.destination,lengthMeters:info.lengthMeters,beamMeters:info.beamMeters};
 });
}

export function parseAISMessage(payload: unknown, now = Date.now()): TrafficTarget | null {
  const data = record(payload), meta = record(data.MetaData), message = record(record(data.Message)[String(data.MessageType)]);
  const latitude = number(message.Latitude) ?? number(meta.latitude), longitude = number(message.Longitude) ?? number(meta.longitude);
  const mmsi = String(meta.MMSI ?? message.UserID ?? '');
  if (!coordinates(latitude, longitude) || !/^\d{9}$/.test(mmsi)) return null;
  const stamp = text(meta.time_utc).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/);
  if (!stamp) return null;
  const observedAt = Date.parse(`${stamp[1]}T${stamp[2]}.${(stamp[3] || '').padEnd(3, '0').slice(0, 3)}Z`);
  const speed = number(message.Sog),vesselType=numeric(meta.type)??numeric(message.Type);
  const target: TrafficTarget = { id: `ship:${mmsi}`, kind: 'maritime', name: text(meta.ShipName) || `MMSI ${mmsi}`,
    latitude: latitude!, longitude: longitude!, altitude: 0, altitudeReference: 'surface',
    speed: speed !== null && speed < 102.3 && speed >= 0 ? speed : null,
    heading: heading(message.TrueHeading) ?? heading(message.Cog), headingReference:heading(message.TrueHeading)!==null?'true heading':heading(message.Cog)!==null?'course over ground':'unknown', observedAt, source: 'AISStream',
    vesselType,vesselClass:vesselClassFromType(vesselType),callSign:text(meta.CallSign),imo:numeric(meta.IMO),destination:text(meta.Destination) };
  return Number.isFinite(observedAt) && isFreshTarget(target, now) ? target : null;
}

export function parseTrafficQuery(params: URLSearchParams) {
  const lat = params.get('lat'), lon = params.get('lon');
  if (!lat?.trim() || !lon?.trim() || !coordinates(Number(lat), Number(lon))) throw new Error('Valid latitude and longitude are required.');
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

export function mergeTrafficReports(previous:TrafficTarget[],incoming:TrafficTarget[],now=Date.now()):TrafficTarget[]{
 const reports=new Map(previous.filter(t=>isFreshTarget(t,now)).map(t=>[t.id,t]));
 for(const report of incoming){if(!isFreshTarget(report,now))continue;const old=reports.get(report.id);if(!old||report.observedAt>old.observedAt)reports.set(report.id,report);}
 return [...reports.values()];
}
