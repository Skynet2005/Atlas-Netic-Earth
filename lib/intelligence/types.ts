export const INTELLIGENCE_KINDS = ['earthquakes', 'fires', 'weather', 'satellites'] as const;
export type IntelligenceKind = (typeof INTELLIGENCE_KINDS)[number];
export type IntelligenceLayers = Record<IntelligenceKind, boolean>;
export type SourcePhase = 'off' | 'loading' | 'live' | 'degraded' | 'stale' | 'fallback' | 'rate_limited' | 'unavailable';
export type SignalSeverity = 'info' | 'minor' | 'moderate' | 'severe' | 'extreme';
export type SignalQuality = 'reported' | 'derived' | 'fallback';

export type SourceHealth = {
  id: string;
  label: string;
  phase: SourcePhase;
  message: string;
  source: string;
  coverage: string;
  updatedAt: number | null;
  latencyMs: number | null;
  count: number;
  cache?: string;
  sourceUrl?: string;
};

export type IntelligenceSignal = {
  id: string;
  kind: IntelligenceKind;
  name: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  observedAt: number;
  expiresAt: number | null;
  source: string;
  sourceUrl?: string;
  severity: SignalSeverity;
  quality: SignalQuality;
  details: Record<string, string | number | boolean | null>;
};

export type IntelligenceSnapshot = {
  signals: IntelligenceSignal[];
  fetchedAt: number;
  health: SourceHealth;
};

export type SatelliteRecord = {
  id: string;
  name: string;
  line1: string;
  line2: string;
  group: string;
  source: string;
  sourceUrl: string;
};

export type SatelliteSnapshot = {
  satellites: SatelliteRecord[];
  fetchedAt: number;
  health: SourceHealth;
};

export const DEFAULT_INTELLIGENCE_LAYERS: IntelligenceLayers = {
  earthquakes: true,
  fires: false,
  weather: false,
  satellites: false,
};

export const EMPTY_HEALTH = (id: IntelligenceKind): SourceHealth => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  phase: 'off',
  message: 'Layer off',
  source: '',
  coverage: '',
  updatedAt: null,
  latencyMs: null,
  count: 0,
});
