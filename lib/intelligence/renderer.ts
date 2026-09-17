import type * as Cesium from 'cesium';
import type { IntelligenceKind, IntelligenceSignal, SatelliteRecord } from './types';
import { satelliteOrbitPath } from './sgp4';

type CModule = typeof Cesium;
const KINDS: IntelligenceKind[] = ['earthquakes', 'fires', 'weather', 'satellites'];

function colorFor(C: CModule, signal: IntelligenceSignal) {
  if (signal.kind === 'satellites') return C.Color.fromCssColorString('#8bd3ff');
  if (signal.kind === 'fires') return C.Color.fromCssColorString('#ff7a45');
  if (signal.kind === 'weather') return signal.severity === 'extreme' || signal.severity === 'severe' ? C.Color.fromCssColorString('#d58cff') : C.Color.fromCssColorString('#79c5ff');
  return signal.severity === 'extreme' ? C.Color.fromCssColorString('#ff3b30') : signal.severity === 'severe' ? C.Color.fromCssColorString('#ff8a3d') : signal.severity === 'moderate' ? C.Color.fromCssColorString('#ffd166') : C.Color.fromCssColorString('#e9f0f5');
}

export class IntelligenceRenderer {
  private readonly sources = new Map<IntelligenceKind, Cesium.CustomDataSource>();
  private readonly selection: Cesium.CustomDataSource;
  private readonly signals = new Map<string, IntelligenceSignal>();
  private readonly handler: Cesium.ScreenSpaceEventHandler;
  private selectionToken = 0;

  constructor(private C: CModule, private viewer: Cesium.Viewer, private onSelect: (signal: IntelligenceSignal | null) => void) {
    for (const kind of KINDS) {
      const source = new C.CustomDataSource(`atlas-intelligence-${kind}`);
      this.sources.set(kind, source);
      void viewer.dataSources.add(source);
    }
    this.selection = new C.CustomDataSource('atlas-intelligence-selection');
    void viewer.dataSources.add(this.selection);
    this.handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
    this.handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(event.position) as { id?: Cesium.Entity } | undefined;
      const entity = picked?.id;
      const value = entity?.properties?.atlasSignalId?.getValue?.();
      if (typeof value !== 'string') return;
      const signal = this.signals.get(value) || null;
      this.onSelect(signal);
      void this.select(signal);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
  }

  sync(signals: IntelligenceSignal[]) {
    const C = this.C;
    const next = new Map(signals.map(signal => [signal.id, signal]));
    this.signals.clear();
    for (const signal of signals) this.signals.set(signal.id, signal);
    for (const kind of KINDS) {
      const source = this.sources.get(kind)!;
      const active = new Set(signals.filter(signal => signal.kind === kind).map(signal => signal.id));
      source.entities.suspendEvents();
      try {
        for (const entity of [...source.entities.values]) if (!active.has(String(entity.id))) source.entities.remove(entity);
        for (const signal of signals) {
          if (signal.kind !== kind) continue;
          const height = signal.kind === 'satellites' ? Math.max(0, signal.altitude ?? 0) : 0;
          const position = C.Cartesian3.fromDegrees(signal.longitude, signal.latitude, height);
          const color = colorFor(C, signal);
          let entity = source.entities.getById(signal.id);
          if (!entity) {
            const common = { id: signal.id, name: signal.name, position, properties: { atlasSignalId: signal.id, atlasKind: signal.kind } };
            if (signal.kind === 'satellites') {
              entity = source.entities.add({ ...common, ellipsoid: { radii: new C.Cartesian3(7000, 7000, 7000), material: color.withAlpha(0.9), outline: true, outlineColor: C.Color.WHITE.withAlpha(0.55), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 25_000_000) }, label: { text: signal.name, font: '12px sans-serif', fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -16), scaleByDistance: new C.NearFarScalar(150_000, 0.9, 8_000_000, 0.35), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 5_000_000), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
            } else if (signal.kind === 'fires') {
              entity = source.entities.add({ ...common, point: { pixelSize: 10, color, outlineColor: C.Color.WHITE.withAlpha(0.8), outlineWidth: 1, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY }, ellipse: { semiMajorAxis: 12_000, semiMinorAxis: 12_000, material: color.withAlpha(0.12), outline: true, outlineColor: color.withAlpha(0.6), heightReference: C.HeightReference.CLAMP_TO_GROUND } });
            } else if (signal.kind === 'weather') {
              entity = source.entities.add({ ...common, point: { pixelSize: signal.severity === 'extreme' || signal.severity === 'severe' ? 14 : 10, color, outlineColor: C.Color.WHITE, outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY }, label: { text: signal.name, font: '12px sans-serif', fillColor: C.Color.WHITE, outlineColor: C.Color.BLACK, outlineWidth: 3, style: C.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new C.Cartesian2(0, -18), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1_500_000), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
            } else {
              const magnitude = Number(signal.details.magnitude || 0);
              entity = source.entities.add({ ...common, point: { pixelSize: Math.max(7, Math.min(20, 5 + magnitude * 2)), color, outlineColor: C.Color.fromCssColorString('#101820'), outlineWidth: 2, heightReference: C.HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY } });
            }
          } else {
            entity.name = signal.name;
            entity.position = new C.ConstantPositionProperty(position);
          }
        }
      } finally { source.entities.resumeEvents(); }
    }
    const current = [...this.selection.entities.values].find(entity => typeof entity.properties?.atlasSignalId?.getValue?.() === 'string');
    if (current && !next.has(String(current.properties?.atlasSignalId?.getValue?.()))) this.clearSelection();
    this.viewer.scene.requestRender();
  }

  async select(signal: IntelligenceSignal | null) {
    const token = ++this.selectionToken;
    this.selection.entities.removeAll();
    if (!signal) { this.viewer.scene.requestRender(); return; }
    const C = this.C;
    const color = colorFor(C, signal);
    const height = signal.kind === 'satellites' ? Math.max(0, signal.altitude ?? 0) : 0;
    this.selection.entities.add({ id: `selected:${signal.id}`, position: C.Cartesian3.fromDegrees(signal.longitude, signal.latitude, height), properties: { atlasSignalId: signal.id }, point: { pixelSize: 20, color: C.Color.TRANSPARENT, outlineColor: color, outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: signal.kind === 'satellites' ? C.HeightReference.NONE : C.HeightReference.CLAMP_TO_GROUND } });
    if (signal.kind === 'satellites') {
      const line1 = String(signal.details.tleLine1 || ''), line2 = String(signal.details.tleLine2 || '');
      if (line1 && line2) {
        const record: SatelliteRecord = { id: String(signal.details.noradId || signal.id), name: signal.name, line1, line2, group: String(signal.details.group || ''), source: signal.source, sourceUrl: signal.sourceUrl || '' };
        const points = await satelliteOrbitPath(record, new Date(signal.observedAt));
        if (token !== this.selectionToken) return;
        if (points.length > 1) this.selection.entities.add({ id: `orbit:${signal.id}`, polyline: { positions: points.map(point => C.Cartesian3.fromDegrees(point.longitude, point.latitude, point.altitude)), width: 2, material: color.withAlpha(0.65), arcType: C.ArcType.NONE } });
      }
    }
    this.viewer.scene.requestRender();
  }

  clearSelection() { this.onSelect(null); void this.select(null); }
  destroy() {
    this.handler.destroy();
    for (const source of this.sources.values()) this.viewer.dataSources.remove(source, true);
    this.viewer.dataSources.remove(this.selection, true);
    this.sources.clear(); this.signals.clear();
  }
}
