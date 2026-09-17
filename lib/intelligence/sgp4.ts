import type { IntelligenceSignal, SatelliteRecord } from './types';

type Vec3 = { x: number; y: number; z: number };
type SatRec = object;
type SatelliteApi = {
  twoline2satrec: (line1: string, line2: string) => SatRec;
  propagate: (satrec: SatRec, date: Date) => { position: Vec3 | false; velocity: Vec3 | false };
  gstime: (date: Date) => number;
  eciToGeodetic: (position: Vec3, gmst: number) => { longitude: number; latitude: number; height: number };
  degreesLong: (radians: number) => number;
  degreesLat: (radians: number) => number;
};

declare global { interface Window { satellite?: SatelliteApi } }

let enginePromise: Promise<SatelliteApi> | undefined;
const satrecs = new Map<string, SatRec>();

export function loadSatelliteEngine() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Satellite propagation is browser-only.'));
  if (window.satellite) return Promise.resolve(window.satellite);
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-atlas-sgp4]');
    if (existing) {
      existing.addEventListener('load', () => window.satellite ? resolve(window.satellite) : reject(new Error('SGP4 library did not initialize.')), { once: true });
      existing.addEventListener('error', () => reject(new Error('SGP4 library failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.dataset.atlasSgp4 = 'true';
    script.src = 'https://cdn.jsdelivr.net/npm/satellite.js@6.0.1/dist/satellite.min.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => window.satellite ? resolve(window.satellite) : reject(new Error('SGP4 library did not initialize.'));
    script.onerror = () => { enginePromise = undefined; reject(new Error('SGP4 library failed to load.')); };
    document.head.appendChild(script);
  });
  return enginePromise;
}

function recordSatrec(record: SatelliteRecord, satellite: SatelliteApi) {
  const key = `${record.line1}\n${record.line2}`;
  let satrec = satrecs.get(key);
  if (!satrec) { satrec = satellite.twoline2satrec(record.line1, record.line2); satrecs.set(key, satrec); }
  return satrec;
}

export async function propagateSatellite(record: SatelliteRecord, at: Date): Promise<IntelligenceSignal | null> {
  const satellite = await loadSatelliteEngine();
  try {
    const state = satellite.propagate(recordSatrec(record, satellite), at);
    if (!state.position || typeof state.position === 'boolean') return null;
    const geodetic = satellite.eciToGeodetic(state.position, satellite.gstime(at));
    const latitude = satellite.degreesLat(geodetic.latitude), longitude = satellite.degreesLong(geodetic.longitude), altitude = geodetic.height * 1000;
    if (![latitude, longitude, altitude].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || altitude < -1000) return null;
    const observedAt = at.getTime();
    return { id: `sat:${record.id}`, kind: 'satellites', name: record.name, latitude, longitude, altitude, observedAt, expiresAt: observedAt + 6 * 60 * 60 * 1000, source: record.source, sourceUrl: record.sourceUrl, severity: 'info', quality: 'derived', details: { noradId: record.id, group: record.group, propagation: 'SGP4/SDP4 via satellite.js 6.0.1', tleLine1: record.line1, tleLine2: record.line2 } };
  } catch { return null; }
}

export async function propagateSatellites(catalog: SatelliteRecord[], at: Date): Promise<IntelligenceSignal[]> {
  const results = await Promise.all(catalog.map(record => propagateSatellite(record, at)));
  return results.filter((signal): signal is IntelligenceSignal => Boolean(signal));
}

export async function satelliteOrbitPath(record: SatelliteRecord, around: Date, minutes = 100, stepMinutes = 2) {
  const points: { latitude: number; longitude: number; altitude: number }[] = [];
  const half = Math.floor(minutes / 2);
  for (let offset = -half; offset <= half; offset += stepMinutes) {
    const signal = await propagateSatellite(record, new Date(around.getTime() + offset * 60_000));
    if (signal && signal.altitude !== null) points.push({ latitude: signal.latitude, longitude: signal.longitude, altitude: signal.altitude });
  }
  return points;
}
