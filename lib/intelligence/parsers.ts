import type { SatelliteRecord, SignalSeverity } from './types';

export function parseViewQuery(params: URLSearchParams) {
  const latitude = Number(params.get('lat'));
  const longitude = Number(params.get('lon'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    throw new Error('Valid latitude and longitude are required.');
  }
  return { latitude: Math.round(latitude * 4) / 4, longitude: Math.round(longitude * 4) / 4 };
}

export function severityFromMagnitude(magnitude: number): SignalSeverity {
  if (magnitude >= 7) return 'extreme';
  if (magnitude >= 6) return 'severe';
  if (magnitude >= 5) return 'moderate';
  if (magnitude >= 3) return 'minor';
  return 'info';
}

export function severityFromWeather(value: unknown): SignalSeverity {
  const text = String(value || '').toLowerCase();
  if (text === 'extreme') return 'extreme';
  if (text === 'severe') return 'severe';
  if (text === 'moderate') return 'moderate';
  if (text === 'minor') return 'minor';
  return 'info';
}

export function centroidOfCoordinates(input: unknown): { latitude: number; longitude: number } | null {
  const points: [number, number][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [longitude, latitude] = value;
      if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) points.push([longitude, latitude]);
      return;
    }
    value.forEach(visit);
  };
  visit(input);
  if (!points.length) return null;
  const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return { latitude, longitude };
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift()?.map(value => value.trim()) ?? [];
  return rows.filter(values => values.some(Boolean)).map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

export function parseTleCatalog(text: string, group: string): SatelliteRecord[] {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const records: SatelliteRecord[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].startsWith('1 ') || !lines[i + 1]?.startsWith('2 ')) continue;
    const line1 = lines[i], line2 = lines[i + 1];
    const previous = lines[i - 1] && !lines[i - 1].startsWith('1 ') && !lines[i - 1].startsWith('2 ') ? lines[i - 1] : '';
    const id = line1.slice(2, 7).trim() || `${group}-${records.length + 1}`;
    const name = previous.replace(/^0\s+/, '').trim() || `NORAD ${id}`;
    records.push({ id, name, line1, line2, group, source: 'CelesTrak', sourceUrl: `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=TLE` });
    i++;
  }
  return records;
}

export function boxesAround(latitude: number, longitude: number, latSpan = 8) {
  const south = Math.max(-90, latitude - latSpan), north = Math.min(90, latitude + latSpan);
  const lonSpan = Math.min(45, latSpan / Math.max(0.18, Math.cos(latitude * Math.PI / 180)));
  const west = longitude - lonSpan, east = longitude + lonSpan;
  if (west >= -180 && east <= 180) return [{ west, south, east, north }];
  if (west < -180) return [{ west: west + 360, south, east: 180, north }, { west: -180, south, east, north }];
  return [{ west, south, east: 180, north }, { west: -180, south, east: east - 360, north }];
}

export function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function timeOr(value: unknown, fallback: number) {
  const parsed = typeof value === 'number' ? value : Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}
