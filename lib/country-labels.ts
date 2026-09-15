export function showCountryLabels(enabled: boolean, altitude: number, width: number, pitch: number) {
  return enabled && Number.isFinite(altitude) && altitude >= (width <= 760 ? 250_000 : 180_000) && pitch < -15;
}
