export function showCountryLabels(enabled: boolean, altitude: number, width: number, pitch: number) {
  return enabled && Number.isFinite(altitude) && altitude >= (width <= 760 ? 260_000 : 190_000) && pitch < -12;
}

export function countryLabelMaximumDistance(size: number) {
  if (size <= 2) return 32_000_000;
  if (size <= 3) return 15_000_000;
  if (size <= 4) return 7_500_000;
  return 3_200_000;
}

export function countryLabelFontSize(width: number, altitude: number, size: number) {
  const compact = width <= 760;
  const medium = width <= 1100;
  const tier = size <= 2 ? 0 : size <= 4 ? 1 : 2;
  const base = compact ? [11.5, 10.5, 9.5][tier] : medium ? [12.5, 11.25, 10.25][tier] : [13.25, 12, 10.75][tier];
  const altitudeScale = altitude > 9_000_000 ? 0.88 : altitude > 4_000_000 ? 0.94 : 1;
  return base * altitudeScale;
}

export function countryLabelViewport(width: number, height: number, altitude: number) {
  const compact = width <= 760;
  const area = width * height;
  const areaScale = Math.min(1.35, Math.max(0.65, area / (1440 * 900)));
  const altitudeBase = altitude > 9_000_000 ? 24 : altitude > 4_000_000 ? 34 : 46;
  return {
    maxVisible: Math.max(compact ? 12 : 18, Math.round(altitudeBase * areaScale * (compact ? 0.7 : 1))),
    sideInset: compact ? 12 : 18,
    topInset: compact ? 64 : 74,
    bottomInset: compact ? 50 : 34,
    horizontalGap: compact ? 9 : 12,
    verticalGap: compact ? 7 : 9,
  };
}
