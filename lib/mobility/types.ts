import type { GeoPoint } from '@/lib/geo';

export type MobilityMode = 'ground' | 'air' | 'rail';
export type GroundProfile = 'driving-car' | 'foot-walking' | 'cycling-regular';
export type GroundAvoid = 'tollways' | 'highways' | 'ferries';

export type DirectionStep = {
  instruction: string;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  type: number | null;
  wayPoints: [number, number] | null;
};

export type GroundRoute = {
  mode: 'ground';
  provider: 'HeiGIT openrouteservice';
  profile: GroundProfile;
  origin: GeoPoint;
  destination: GeoPoint;
  distanceMeters: number;
  durationSeconds: number;
  points: GeoPoint[];
  steps: DirectionStep[];
  avoided: GroundAvoid[];
  generatedAt: number;
};

export type AirwaySegment = {
  sequence: number;
  from: string;
  to: string;
  minimumEnrouteAltitude: string | null;
  maximumAuthorizedAltitude: string | null;
};

export type AirwayRoute = {
  mode: 'air';
  provider: 'FAA NASR';
  airwayId: string;
  effectiveDate: string;
  remark: string;
  points: GeoPoint[];
  segments: AirwaySegment[];
  unresolvedPoints: string[];
  sourceUrl: string;
  generatedAt: number;
};

export type NotamRecord = {
  id: string;
  location: string;
  text: string;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type NotamResponse = {
  provider: 'FAA NMS';
  phase: 'live' | 'not_configured' | 'unavailable';
  records: NotamRecord[];
  message: string;
  generatedAt: number;
};

export type RailStop = {
  stopId: string;
  name: string;
  arrival: string;
  departure: string;
  sequence: number;
  latitude: number | null;
  longitude: number | null;
};

export type RailAlternative = {
  tripId: string;
  train: string;
  route: string;
  headsign: string;
};

export type RailJourney = {
  mode: 'rail';
  provider: 'Amtrak GTFS';
  realtime: false;
  serviceDate: string;
  tripId: string;
  train: string;
  route: string;
  headsign: string;
  stops: RailStop[];
  points: GeoPoint[];
  alternatives: RailAlternative[];
  sourceUrl: string;
  generatedAt: number;
};

export type MobilityPathKind = 'ground' | 'air' | 'rail';
