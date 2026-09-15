export const TERRAIN_VIEW_ANGLE = 24;
export const GLOBE_VIEW_RANGE = 600_000;
export const TERRAIN_PLACES = [
  { name: 'Himalayas', detail: 'Everest · Nepal / China', lng: 86.9250, lat: 27.9881, range: 14000, heading: 0 },
  { name: 'The Alps', detail: 'Matterhorn · Switzerland / Italy', lng: 7.6586, lat: 45.9763, range: 10000, heading: 160 },
  { name: 'Grand Canyon', detail: 'Colorado Plateau · United States', lng: -112.113, lat: 36.099, range: 10500, heading: 20 },
  { name: 'The Andes', detail: 'Aconcagua · Argentina', lng: -70.0109, lat: -32.6532, range: 14000, heading: 20 },
];

export function nearestTerrainPlace(latitude: number, longitude: number) {
  const rad = Math.PI / 180;
  const score = (place: typeof TERRAIN_PLACES[number]) =>
    Math.sin((place.lat - latitude) * rad / 2) ** 2 +
    Math.cos(latitude * rad) * Math.cos(place.lat * rad) * Math.sin((place.lng - longitude) * rad / 2) ** 2;
  return TERRAIN_PLACES.reduce((best, place) => score(place) < score(best) ? place : best);
}

export function planTerrainApproach(input: {
  range: number; angle: number; height: number; maximumHeight: number; exaggeration: number;
}) {
  if (Object.values(input).some(value => !Number.isFinite(value))) throw new Error('Invalid terrain camera input.');
  const angle = Math.max(15, Math.min(90, input.angle));
  const scale = Math.max(1, Math.min(6, input.exaggeration));
  const height = input.height * scale;
  const requestedRange = Math.max(1200, Math.min(18000, input.range));
  // Clear the highest sampled ground along the approach, including exaggerated terrain.
  const minimumRange = (Math.max(0, input.maximumHeight - input.height) * scale + 700) / Math.sin(angle * Math.PI / 180);
  return { angle, height, range: Math.max(requestedRange, minimumRange) };
}

export function approachCoordinates(lng: number, lat: number, range: number, angle: number, heading: number) {
  const radians = Math.PI / 180;
  const horizontal = range * Math.cos(angle * radians);
  const cosLatitude = Math.max(0.08, Math.cos(lat * radians));
  return [0, 0.25, 0.5, 0.75, 1].map(fraction => ({
    longitude: ((lng - Math.sin(heading * radians) * horizontal * fraction / (111320 * cosLatitude) + 540) % 360) - 180,
    latitude: Math.max(-85, Math.min(85, lat - Math.cos(heading * radians) * horizontal * fraction / 111320)),
  }));
}
