import type { IntelligenceSignal } from './types';

export type SatelliteVisualClass =
  | 'generic'
  | 'station'
  | 'starlink'
  | 'navigation'
  | 'weather'
  | 'communications'
  | 'earth-observation'
  | 'science';

export type SatelliteVisualSpec = {
  className: SatelliteVisualClass;
  low: string;
  detail: string;
  label: string;
  minimumPixelSize: number;
};

const normalize = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const hasAny = (value: string, terms: string[]) => terms.some(term => value.includes(term));

export function satelliteVisualClass(signal: Pick<IntelligenceSignal, 'name' | 'details'>): SatelliteVisualClass {
  const name = normalize(signal.name);
  const group = normalize(signal.details.group);
  const text = `${name} ${group}`;

  if (hasAny(text, ['ISS ', 'ISS ZARYA', 'TIANGONG', 'CSS ', 'SPACE STATION', 'STATIONS'])) return 'station';
  if (hasAny(text, ['STARLINK'])) return 'starlink';
  if (hasAny(text, ['GPS ', 'GPS OPS', 'GLONASS', 'GALILEO', 'BEIDOU', 'BEIDOU', 'QZSS', 'IRNSS', 'NAVSTAR'])) return 'navigation';
  if (hasAny(text, ['WEATHER', 'NOAA', 'GOES', 'METEOR', 'METOP', 'HIMAWARI', 'FENGYUN', 'FY '])) return 'weather';
  if (hasAny(text, ['LANDSAT', 'SENTINEL', 'WORLDVIEW', 'PLANET', 'ICEYE', 'CAPELLA', 'EARTH OBSERVATION', 'EARTH RESOURCES'])) return 'earth-observation';
  if (hasAny(text, ['IRIDIUM', 'INTELSAT', 'SES ', 'INMARSAT', 'EUTELSAT', 'TELSTAR', 'COMMUNICATION'])) return 'communications';
  if (hasAny(text, ['SCIENCE', 'HUBBLE', 'JWST', 'SWIFT', 'FERMI', 'CHANDRA', 'TESS'])) return 'science';
  return 'generic';
}

const SATELLITE_LABELS: Record<SatelliteVisualClass, string> = {
  generic: 'Satellite',
  station: 'Orbital station',
  starlink: 'Starlink satellite',
  navigation: 'Navigation satellite',
  weather: 'Weather satellite',
  communications: 'Communications satellite',
  'earth-observation': 'Earth observation satellite',
  science: 'Science satellite',
};

export function satelliteVisualSpec(signal: Pick<IntelligenceSignal, 'name' | 'details'>): SatelliteVisualSpec {
  const className = satelliteVisualClass(signal);
  const base = `/models/satellite-${className}`;
  return {
    className,
    low: `${base}-low.gltf`,
    detail: `${base}-detail.gltf`,
    label: SATELLITE_LABELS[className],
    minimumPixelSize: className === 'station' ? 32 : className === 'starlink' ? 24 : 27,
  };
}

function svgData(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function iconSvg(kind: 'earthquakes' | 'fires' | 'weather', color: string) {
  const common = `fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"`;
  const body = kind === 'fires'
    ? `<path ${common} d="M16.2 4.3c.7 4.2-2.8 5.1-1.4 8.1.8 1.8 3.2 1.8 3.6 4.4.5 3.2-2 6.2-6.3 6.2-4.1 0-7-2.6-6.5-6.4.4-2.8 2.4-4.4 4.5-6.9.2 2.7 1.5 3.6 2.6 3.1 1.8-.8.9-4.9 3.5-8.5Z"/><path ${common} d="M12.3 15.1c2.1 1.5 2.2 3.9.3 5.1-2 1.3-4.6-.5-3.8-2.8.4-1.1 1.3-1.7 2.1-2.7.2.8.6 1.2 1.4.4Z"/>`
    : kind === 'weather'
      ? `<path ${common} d="M7.2 17.2h9.5a4 4 0 0 0 .5-8 5.4 5.4 0 0 0-10.3 1.7 3.2 3.2 0 0 0 .3 6.3Z"/><path ${common} d="m13.2 13.6-2.3 4.1h2.1l-1.6 3.2 4.2-4.8h-2.2l1.5-2.5Z"/>`
      : `<path ${common} d="M3.7 14.2h4l2-4 3.1 7.1 2.2-4.4 1.4 2.7h3.9"/><circle ${common} cx="12" cy="12" r="9"/>`;
  return svgData(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="rgba(3,11,17,.76)" stroke="rgba(255,255,255,.34)" stroke-width="1"/>${body}</svg>`);
}

export function signalIcon(signal: Pick<IntelligenceSignal, 'kind' | 'severity'>) {
  if (signal.kind === 'fires') return iconSvg('fires', '#ff8a52');
  if (signal.kind === 'weather') return iconSvg('weather', signal.severity === 'extreme' || signal.severity === 'severe' ? '#dca0ff' : '#8bd3ff');
  if (signal.kind === 'earthquakes') {
    const color = signal.severity === 'extreme' ? '#ff554d' : signal.severity === 'severe' ? '#ff9a55' : signal.severity === 'moderate' ? '#ffd166' : '#e9f0f5';
    return iconSvg('earthquakes', color);
  }
  return '';
}

export function signalVisualLabel(signal: Pick<IntelligenceSignal, 'kind' | 'name' | 'details'>) {
  if (signal.kind === 'satellites') return satelliteVisualSpec(signal).label;
  if (signal.kind === 'fires') return 'Active fire';
  if (signal.kind === 'weather') return 'Weather alert';
  return 'Earthquake';
}
