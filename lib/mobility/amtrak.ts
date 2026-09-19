import type { GeoPoint } from '@/lib/geo';
import { normalizeId, numberOrNull, parseCsv, type CsvRecord } from '@/lib/mobility/csv';
import { fetchArchive, readZipEntry } from '@/lib/mobility/zip';
import type { RailAlternative, RailJourney, RailStop } from '@/lib/mobility/types';

const AMTRAK_GTFS = 'https://content.amtrak.com/content/gtfs/GTFS.zip';
let cache: { expires: number; data: Promise<GtfsData> } | null = null;

type GtfsData = {
  trips: CsvRecord[];
  routes: Map<string, CsvRecord>;
  stops: Map<string, CsvRecord>;
  stopTimes: CsvRecord[];
  calendar: CsvRecord[];
  exceptions: CsvRecord[];
  shapesText: string;
};

function entry(buffer: Buffer, name: string, optional = false) {
  try { return readZipEntry(buffer, new RegExp(`(?:^|/)${name.replace('.', '\\.')}\\s*$`, 'i')); }
  catch (error) { if (optional) return ''; throw error; }
}

async function gtfs(): Promise<GtfsData> {
  if (cache && cache.expires > Date.now()) return cache.data;
  const data = (async () => {
    const archive = await fetchArchive(AMTRAK_GTFS, 25_000);
    const routes = parseCsv(entry(archive, 'routes.txt'));
    const stops = parseCsv(entry(archive, 'stops.txt'));
    return {
      trips: parseCsv(entry(archive, 'trips.txt')),
      routes: new Map(routes.map(row => [row.route_id, row])),
      stops: new Map(stops.map(row => [row.stop_id, row])),
      stopTimes: parseCsv(entry(archive, 'stop_times.txt')),
      calendar: parseCsv(entry(archive, 'calendar.txt', true)),
      exceptions: parseCsv(entry(archive, 'calendar_dates.txt', true)),
      shapesText: entry(archive, 'shapes.txt'),
    };
  })();
  cache = { expires: Date.now() + 6 * 60 * 60 * 1000, data };
  try { return await data; } catch (error) { cache = null; throw error; }
}

function serviceDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a service date in YYYY-MM-DD format.');
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid service date.');
  return date;
}

function ymd(date: Date) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth()+1).padStart(2,'0')}${String(date.getUTCDate()).padStart(2,'0')}`;
}

function activeServices(data: GtfsData, date: Date) {
  const key = ymd(date);
  const weekday = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][date.getUTCDay()];
  const active = new Set<string>();
  for (const row of data.calendar) {
    if (row[weekday] === '1' && (!row.start_date || key >= row.start_date) && (!row.end_date || key <= row.end_date)) active.add(row.service_id);
  }
  for (const row of data.exceptions) {
    if (row.date !== key) continue;
    if (row.exception_type === '1') active.add(row.service_id);
    else if (row.exception_type === '2') active.delete(row.service_id);
  }
  return active;
}

function routeName(row: CsvRecord | undefined) {
  if (!row) return 'Amtrak';
  return [row.route_short_name, row.route_long_name].filter(Boolean).join(' · ') || 'Amtrak';
}

function railRoute(row: CsvRecord | undefined) {
  return !row?.route_type || row.route_type === '2';
}

function decimate(points: GeoPoint[], max = 2400) {
  if (points.length <= max) return points;
  const stride = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * stride)]);
}

function shapePoints(text: string, shapeId: string) {
  const newline = text.indexOf('\n');
  if (newline < 0) return [];
  const header = text.slice(0, newline).replace(/\r$/, '').split(',');
  const idIndex = header.indexOf('shape_id'), latIndex = header.indexOf('shape_pt_lat'), lonIndex = header.indexOf('shape_pt_lon'), seqIndex = header.indexOf('shape_pt_sequence');
  if ([idIndex,latIndex,lonIndex,seqIndex].some(index => index < 0)) return [];
  const points: Array<GeoPoint & { sequence: number }> = [];
  let start = newline + 1;
  while (start < text.length) {
    let end = text.indexOf('\n', start); if (end < 0) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, '');
    start = end + 1;
    if (!line) continue;
    const values = line.split(',');
    if (values[idIndex] !== shapeId) continue;
    const latitude = numberOrNull(values[latIndex]), longitude = numberOrNull(values[lonIndex]), sequence = numberOrNull(values[seqIndex]);
    if (latitude === null || longitude === null || sequence === null) continue;
    points.push({ latitude, longitude, sequence });
  }
  points.sort((a,b) => a.sequence - b.sequence);
  return decimate(points.map(({latitude,longitude}) => ({latitude,longitude})));
}

function score(row: CsvRecord, query: string, route: CsvRecord | undefined) {
  const train = normalizeId(row.trip_short_name || ''), q = normalizeId(query);
  if (train === q) return 0;
  if (train.startsWith(q)) return 1;
  const haystack = `${row.trip_headsign || ''} ${routeName(route)} ${row.trip_id || ''}`.toUpperCase();
  return haystack.includes(q) ? 2 : 99;
}

export async function lookupAmtrak(input: { query: string; date: string; tripId?: string }): Promise<RailJourney> {
  const query = input.query.trim();
  if (!query || query.length > 120) throw new Error('Enter an Amtrak train number or route name.');
  const date = serviceDate(input.date);
  const data = await gtfs();
  const active = activeServices(data, date);
  const candidates = data.trips
    .filter(row => active.has(row.service_id) && railRoute(data.routes.get(row.route_id)))
    .map(row => ({ row, score: score(row, query, data.routes.get(row.route_id)) }))
    .filter(item => input.tripId ? item.row.trip_id === input.tripId : item.score < 99)
    .sort((a,b) => a.score - b.score || (a.row.trip_short_name || '').localeCompare(b.row.trip_short_name || ''));
  if (!candidates.length) throw new Error(`No scheduled Amtrak rail trip matched “${query}” on ${input.date}.`);
  const primary = candidates[0].row;
  const stopRows = data.stopTimes
    .filter(row => row.trip_id === primary.trip_id)
    .sort((a,b) => (numberOrNull(a.stop_sequence) ?? 0) - (numberOrNull(b.stop_sequence) ?? 0));
  const stops: RailStop[] = stopRows.map((row, index) => {
    const stop = data.stops.get(row.stop_id);
    return {
      stopId: row.stop_id,
      name: stop?.stop_name || row.stop_id,
      arrival: row.arrival_time || '',
      departure: row.departure_time || '',
      sequence: numberOrNull(row.stop_sequence) ?? index,
      latitude: numberOrNull(stop?.stop_lat),
      longitude: numberOrNull(stop?.stop_lon),
    };
  });
  const fallbackPoints = stops.flatMap(stop => stop.latitude === null || stop.longitude === null ? [] : [{ latitude: stop.latitude, longitude: stop.longitude, name: stop.name }]);
  const shape = primary.shape_id ? shapePoints(data.shapesText, primary.shape_id) : [];
  const alternatives: RailAlternative[] = candidates.slice(0, 8).map(({row}) => ({
    tripId: row.trip_id,
    train: row.trip_short_name || row.trip_id,
    route: routeName(data.routes.get(row.route_id)),
    headsign: row.trip_headsign || '',
  }));
  return {
    mode: 'rail',
    provider: 'Amtrak GTFS',
    realtime: false,
    serviceDate: input.date,
    tripId: primary.trip_id,
    train: primary.trip_short_name || primary.trip_id,
    route: routeName(data.routes.get(primary.route_id)),
    headsign: primary.trip_headsign || '',
    stops,
    points: shape.length > 1 ? shape : fallbackPoints,
    alternatives,
    sourceUrl: AMTRAK_GTFS,
    generatedAt: Date.now(),
  };
}
