import type { IntelligenceSignal } from './intelligence/types';
import type { TrafficTarget } from './traffic';

export type SemanticZoomLevel = 'global' | 'regional' | 'local';

export function semanticZoomForAltitude(altitudeMeters: number): SemanticZoomLevel {
  if (altitudeMeters >= 5_000_000) return 'global';
  if (altitudeMeters >= 700_000) return 'regional';
  return 'local';
}

export function semanticZoomLabel(level: SemanticZoomLevel) {
  return level === 'global' ? 'GLOBAL' : level === 'regional' ? 'REGIONAL' : 'LOCAL';
}

function longitudeMean(values: number[]) {
  let x = 0, y = 0;
  for (const longitude of values) {
    const radians = longitude * Math.PI / 180;
    x += Math.cos(radians);
    y += Math.sin(radians);
  }
  return Math.atan2(y, x) * 180 / Math.PI;
}

const severityWeight = { info: 0, minor: 1, moderate: 2, severe: 3, extreme: 4 } as const;

export type IntelligenceCluster = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  severity: IntelligenceSignal['severity'];
  counts: Record<IntelligenceSignal['kind'], number>;
};

export function clusterIntelligence(signals: IntelligenceSignal[], cellDegrees = 10): IntelligenceCluster[] {
  const cells = new Map<string, IntelligenceSignal[]>();
  for (const signal of signals) {
    const latCell = Math.floor((signal.latitude + 90) / cellDegrees);
    const lonCell = Math.floor((signal.longitude + 180) / cellDegrees);
    const key = `${latCell}:${lonCell}`;
    const list = cells.get(key);
    if (list) list.push(signal);
    else cells.set(key, [signal]);
  }
  return [...cells.entries()].map(([key, items]) => {
    const counts = { earthquakes: 0, fires: 0, weather: 0, satellites: 0 };
    let severity: IntelligenceSignal['severity'] = 'info';
    for (const item of items) {
      counts[item.kind]++;
      if (severityWeight[item.severity] > severityWeight[severity]) severity = item.severity;
    }
    return {
      id: `intel-cluster:${key}`,
      latitude: items.reduce((sum, item) => sum + item.latitude, 0) / items.length,
      longitude: longitudeMean(items.map(item => item.longitude)),
      count: items.length,
      severity,
      counts,
    };
  }).sort((a, b) => b.count - a.count);
}

export type TrafficCluster = {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  air: number;
  military: number;
  maritime: number;
};

export function clusterTraffic(targets: TrafficTarget[], cellDegrees = 10): TrafficCluster[] {
  const cells = new Map<string, TrafficTarget[]>();
  for (const target of targets) {
    const latCell = Math.floor((target.latitude + 90) / cellDegrees);
    const lonCell = Math.floor((target.longitude + 180) / cellDegrees);
    const key = `${latCell}:${lonCell}`;
    const list = cells.get(key);
    if (list) list.push(target);
    else cells.set(key, [target]);
  }
  return [...cells.entries()].map(([key, items]) => ({
    id: `traffic-cluster:${key}`,
    latitude: items.reduce((sum, item) => sum + item.latitude, 0) / items.length,
    longitude: longitudeMean(items.map(item => item.longitude)),
    count: items.length,
    air: items.filter(item => item.kind === 'air').length,
    military: items.filter(item => item.kind === 'military').length,
    maritime: items.filter(item => item.kind === 'maritime').length,
  })).sort((a, b) => b.count - a.count);
}

export function intelligenceClusterSummary(cluster: IntelligenceCluster) {
  const parts = [
    cluster.counts.satellites ? `SAT ${cluster.counts.satellites}` : '',
    cluster.counts.weather ? `WX ${cluster.counts.weather}` : '',
    cluster.counts.fires ? `FIRE ${cluster.counts.fires}` : '',
    cluster.counts.earthquakes ? `EQ ${cluster.counts.earthquakes}` : '',
  ].filter(Boolean);
  return parts.slice(0, 2).join(' · ');
}

export function trafficClusterSummary(cluster: TrafficCluster) {
  return [
    cluster.air ? `AIR ${cluster.air}` : '',
    cluster.military ? `MIL ${cluster.military}` : '',
    cluster.maritime ? `SEA ${cluster.maritime}` : '',
  ].filter(Boolean).join(' · ');
}
