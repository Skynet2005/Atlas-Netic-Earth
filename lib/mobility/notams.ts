import { compactText, numberOrNull } from '@/lib/mobility/csv';
import type { NotamRecord, NotamResponse } from '@/lib/mobility/types';

type RecordLike = Record<string, unknown>;
const record = (value: unknown): RecordLike => value && typeof value === 'object' ? value as RecordLike : {};

function firstText(source: RecordLike, keys: string[]) {
  for (const key of keys) {
    const value = compactText(source[key], 8000);
    if (value) return value;
  }
  return '';
}

function firstNumber(source: RecordLike, keys: string[]) {
  for (const key of keys) {
    const value = numberOrNull(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function records(payload: unknown): RecordLike[] {
  if (Array.isArray(payload)) return payload.map(record);
  const root = record(payload);
  for (const key of ['notams','items','results','data','features']) {
    const value = root[key];
    if (Array.isArray(value)) return value.map(item => {
      const candidate = record(item);
      const properties = record(candidate.properties);
      return Object.keys(properties).length ? { ...candidate, ...properties } : candidate;
    });
  }
  return [];
}

export async function lookupNotams(location: string): Promise<NotamResponse> {
  const normalized = location.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,8}$/.test(normalized)) throw new Error('Enter an airport or NOTAM location identifier such as KCAE.');
  const template = process.env.FAA_NMS_API_URL?.trim();
  const apiKey = process.env.FAA_NMS_API_KEY?.trim();
  if (!template || !apiKey) {
    return {
      provider: 'FAA NMS',
      phase: 'not_configured',
      records: [],
      message: 'FAA NMS API access is not configured. Atlas will not scrape the public NOTAM Search page or invent operational notices.',
      generatedAt: Date.now(),
    };
  }
  if (!template.includes('{location}')) throw new Error('FAA_NMS_API_URL must contain a {location} placeholder.');
  const headerName = process.env.FAA_NMS_API_KEY_HEADER?.trim() || 'X-API-Key';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const response = await fetch(template.replace('{location}', encodeURIComponent(normalized)), {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json', [headerName]: apiKey },
    });
    if (!response.ok) {
      return {
        provider: 'FAA NMS',
        phase: 'unavailable',
        records: [],
        message: `FAA NMS returned HTTP ${response.status}. Verify the current NMS API URL, access scope and authentication header.`,
        generatedAt: Date.now(),
      };
    }
    const payload: unknown = await response.json();
    const parsed: NotamRecord[] = records(payload).slice(0, 250).map((item, index) => {
      const latitude = firstNumber(item, ['latitude','lat','Latitude']);
      const longitude = firstNumber(item, ['longitude','lon','lng','Longitude']);
      return {
        id: firstText(item, ['id','notamId','notam_id','number','notamNumber']) || `${normalized}-${index+1}`,
        location: firstText(item, ['location','locationId','facility','icao','airport']) || normalized,
        text: firstText(item, ['text','notamText','traditionalMessage','message','description']) || 'NOTAM text not mapped by this NMS response schema.',
        effectiveStart: firstText(item, ['effectiveStart','startDate','start','validFrom']) || null,
        effectiveEnd: firstText(item, ['effectiveEnd','endDate','end','validTo']) || null,
        latitude: latitude !== null && Math.abs(latitude) <= 90 ? latitude : null,
        longitude: longitude !== null && Math.abs(longitude) <= 180 ? longitude : null,
      };
    });
    return {
      provider: 'FAA NMS',
      phase: 'live',
      records: parsed,
      message: parsed.length ? `${parsed.length} NMS records received for ${normalized}.` : `No NMS records returned for ${normalized}.`,
      generatedAt: Date.now(),
    };
  } catch (error) {
    return {
      provider: 'FAA NMS',
      phase: 'unavailable',
      records: [],
      message: error instanceof Error ? error.message : 'FAA NMS is unavailable.',
      generatedAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}
