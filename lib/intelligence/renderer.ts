import type * as Cesium from 'cesium';
import type { IntelligenceKind, IntelligenceSignal, SatelliteRecord } from './types';
import { satelliteOrbitPath } from './sgp4';

type CModule = typeof Cesium;
const KINDS: IntelligenceKind[] = ['earthquakes', 'fires', 'weather', 'satellites'];
const SEVERITY_WEIGHT = { info: 0, minor: 1, moderate: 2, severe: 3, extreme: 4 } as const;

function colorFor(C: CModule, signal: IntelligenceSignal) {
  if (signal.kind === 'satellites') return C.Color.fromCssColorString('#8bd3ff');
  if (signal.kind === 'fires') return C.Color.fromCssColorString('#ff7a45');
  if (signal.kind === 'weather') return signal.severity === 'extreme' || signal.severity === 'severe' ? C.Color.fromCssColorString('#d58cff') : C.Color.fromCssColorString('#79c5ff');
  return signal.severity === 'extreme' ? C.Color.fromCssColorString('#ff3b30') : signal.severity === 'severe' ? C.Color.fromCssColorString('#ff8a3d') : signal.severity === 'moderate' ? C.Color.fromCssColorString('#ffd166') : C.Color.fromCssColorString('#e9f0f5');
}

function priority(signal: IntelligenceSignal) {
  return SEVERITY_WEIGHT[signal.severity] * 1_000_000_000_000_000 + signal.observedAt;
}

function distanceLimit(signal: IntelligenceSignal) {
  if (signal.kind === 'satellites') return 60_000_000;
  if (signal.kind === 'earthquakes') return 28_000_000;
  if (signal.kind === 'fires') return 10_000_000;
  return 8_000_000;
}

export class IntelligenceRenderer {
  private readonly sources = new Map<IntelligenceKind, Cesium.CustomDataSource>();
  private readonly selection: Cesium.CustomDataSource;
  private readonly signals = new Map<string, IntelligenceSignal>();
  private readonly handler: Cesium.ScreenSpaceEventHandler;
  private readonly removeCameraListener: () => void;
  private selectionToken = 0;
  private visibilityFrame: number | null = null;

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
    this.removeCameraListener = viewer.camera.changed.addEventListener(() => this.queueVisibilityUpdate());
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
              entity = source.entities.add({
                ...common,
                ellipsoid: {
                  radii: new C.Cartesian3(7000, 7000, 7000),
                  material: color.withAlpha(0.82),
                  outline: true,
                  outlineColor: C.Color.WHITE.withAlpha(0.38),
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 60_000_000),
                },
                label: {
                  text: signal.name,
                  font: '500 11px Inter, sans-serif',
                  fillColor: C.Color.WHITE.withAlpha(0.92),
                  outlineColor: C.Color.fromCssColorString('#061018'),
                  outlineWidth: 3,
                  style: C.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new C.Cartesian2(0, -15),
                  scaleByDistance: new C.NearFarScalar(100_000, 0.9, 1_500_000, 0.35),
                  translucencyByDistance: new C.NearFarScalar(100_000, 1, 1_500_000, 0),
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1_500_000),
                  disableDepthTestDistance: 0,
                },
              });
            } else if (signal.kind === 'fires') {
              entity = source.entities.add({
                ...common,
                point: {
                  pixelSize: 8,
                  color: color.withAlpha(0.9),
                  outlineColor: C.Color.WHITE.withAlpha(0.52),
                  outlineWidth: 1,
                  heightReference: C.HeightReference.CLAMP_TO_GROUND,
                  scaleByDistance: new C.NearFarScalar(30_000, 1.15, 6_000_000, 0.55),
                  translucencyByDistance: new C.NearFarScalar(500_000, 0.95, 9_000_000, 0.25),
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 10_000_000),
                  disableDepthTestDistance: 0,
                },
                ellipse: {
                  semiMajorAxis: 9_000,
                  semiMinorAxis: 9_000,
                  material: color.withAlpha(0.08),
                  outline: true,
                  outlineColor: color.withAlpha(0.38),
                  heightReference: C.HeightReference.CLAMP_TO_GROUND,
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 2_000_000),
                },
              });
            } else if (signal.kind === 'weather') {
              const important = signal.severity === 'extreme' || signal.severity === 'severe';
              entity = source.entities.add({
                ...common,
                point: {
                  pixelSize: important ? 12 : 8,
                  color: color.withAlpha(0.92),
                  outlineColor: C.Color.WHITE.withAlpha(important ? 0.9 : 0.55),
                  outlineWidth: important ? 2 : 1,
                  heightReference: C.HeightReference.CLAMP_TO_GROUND,
                  scaleByDistance: new C.NearFarScalar(50_000, 1.15, 5_000_000, 0.55),
                  translucencyByDistance: new C.NearFarScalar(500_000, 1, 8_000_000, 0.25),
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 8_000_000),
                  disableDepthTestDistance: 0,
                },
                label: important ? {
                  text: signal.name,
                  font: '500 11px Inter, sans-serif',
                  fillColor: C.Color.WHITE,
                  outlineColor: C.Color.fromCssColorString('#061018'),
                  outlineWidth: 3,
                  style: C.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new C.Cartesian2(0, -17),
                  scaleByDistance: new C.NearFarScalar(25_000, 1, 1_200_000, 0.45),
                  translucencyByDistance: new C.NearFarScalar(150_000, 1, 1_200_000, 0),
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 1_200_000),
                  disableDepthTestDistance: 0,
                } : undefined,
              });
            } else {
              const magnitude = Number(signal.details.magnitude || 0);
              entity = source.entities.add({
                ...common,
                point: {
                  pixelSize: Math.max(6, Math.min(16, 4 + magnitude * 1.65)),
                  color: color.withAlpha(0.92),
                  outlineColor: C.Color.fromCssColorString('#07121a').withAlpha(0.88),
                  outlineWidth: 1.5,
                  heightReference: C.HeightReference.CLAMP_TO_GROUND,
                  scaleByDistance: new C.NearFarScalar(50_000, 1.15, 18_000_000, 0.55),
                  translucencyByDistance: new C.NearFarScalar(1_000_000, 1, 26_000_000, 0.38),
                  distanceDisplayCondition: new C.DistanceDisplayCondition(0, 28_000_000),
                  disableDepthTestDistance: 0,
                },
              });
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
    this.queueVisibilityUpdate();
    this.viewer.scene.requestRender();
  }

  private queueVisibilityUpdate() {
    if (this.visibilityFrame !== null) return;
    this.visibilityFrame = requestAnimationFrame(() => {
      this.visibilityFrame = null;
      this.updateVisibility();
    });
  }

  private updateVisibility() {
    const C = this.C, viewer = this.viewer;
    if (!viewer.scene || viewer.scene.isDestroyed()) return;
    const width = Math.max(1, viewer.canvas.clientWidth), height = Math.max(1, viewer.canvas.clientHeight);
    const cameraHeight = viewer.camera.positionCartographic.height;
    const baseCell = cameraHeight > 8_000_000 ? 54 : cameraHeight > 2_000_000 ? 42 : cameraHeight > 500_000 ? 30 : 20;
    const areaScale = Math.min(1.35, Math.max(0.55, (width * height) / (1440 * 900)));
    const baseMaximum = cameraHeight > 8_000_000 ? 260 : cameraHeight > 2_000_000 ? 520 : 1_100;
    const maxVisible = Math.round(baseMaximum * areaScale);
    const ellipsoid = viewer.scene.globe.ellipsoid;
    const scaledCamera = ellipsoid.transformPositionToScaledSpace(viewer.camera.positionWC, new C.Cartesian3());
    const now = viewer.clock.currentTime;
    const towardCamera = new C.Cartesian3();
    const scaledPoint = new C.Cartesian3();
    const candidates: { signal: IntelligenceSignal; entity: Cesium.Entity; x: number; y: number }[] = [];

    for (const signal of this.signals.values()) {
      const entity = this.sources.get(signal.kind)?.entities.getById(signal.id);
      const position = entity?.position?.getValue(now);
      if (!entity || !position) continue;
      C.Cartesian3.subtract(position, viewer.camera.positionWC, towardCamera);
      const facingCamera = C.Cartesian3.dot(towardCamera, viewer.camera.directionWC) > 0;
      const aboveHorizon = signal.kind === 'satellites' || C.Cartesian3.dot(scaledCamera, ellipsoid.transformPositionToScaledSpace(position, scaledPoint)) > 1.001;
      if (!facingCamera || !aboveHorizon || C.Cartesian3.distance(viewer.camera.positionWC, position) > distanceLimit(signal)) {
        entity.show = false;
        continue;
      }
      const screen = C.SceneTransforms.worldToWindowCoordinates(viewer.scene, position);
      if (!screen || screen.x < -30 || screen.x > width + 30 || screen.y < -30 || screen.y > height + 30) {
        entity.show = false;
        continue;
      }
      candidates.push({ signal, entity, x: screen.x, y: screen.y });
    }

    candidates.sort((a, b) => priority(b.signal) - priority(a.signal));
    const occupied = new Set<string>();
    let shown = 0;
    for (const item of candidates) {
      const important = item.signal.severity === 'extreme' || item.signal.severity === 'severe';
      const cell = item.signal.kind === 'satellites' ? baseCell + 10 : baseCell;
      const namespace = item.signal.kind === 'satellites' ? 'orbit' : 'ground';
      const key = `${namespace}:${Math.floor(item.x / cell)}:${Math.floor(item.y / cell)}`;
      const show = shown < maxVisible && (important || !occupied.has(key));
      item.entity.show = show;
      if (show) {
        occupied.add(key);
        shown++;
      }
    }
    viewer.scene.requestRender();
  }

  async select(signal: IntelligenceSignal | null) {
    const token = ++this.selectionToken;
    this.selection.entities.removeAll();
    if (!signal) { this.viewer.scene.requestRender(); return; }
    const C = this.C;
    const color = colorFor(C, signal);
    const height = signal.kind === 'satellites' ? Math.max(0, signal.altitude ?? 0) : 0;
    this.selection.entities.add({
      id: `selected:${signal.id}`,
      position: C.Cartesian3.fromDegrees(signal.longitude, signal.latitude, height),
      properties: { atlasSignalId: signal.id },
      point: {
        pixelSize: 21,
        color: C.Color.TRANSPARENT,
        outlineColor: color.withAlpha(0.98),
        outlineWidth: 3,
        disableDepthTestDistance: 0,
        heightReference: signal.kind === 'satellites' ? C.HeightReference.NONE : C.HeightReference.CLAMP_TO_GROUND,
      },
    });
    if (signal.kind === 'satellites') {
      const line1 = String(signal.details.tleLine1 || ''), line2 = String(signal.details.tleLine2 || '');
      if (line1 && line2) {
        const record: SatelliteRecord = { id: String(signal.details.noradId || signal.id), name: signal.name, line1, line2, group: String(signal.details.group || ''), source: signal.source, sourceUrl: signal.sourceUrl || '' };
        const points = await satelliteOrbitPath(record, new Date(signal.observedAt));
        if (token !== this.selectionToken) return;
        if (points.length > 1) this.selection.entities.add({ id: `orbit:${signal.id}`, polyline: { positions: points.map(point => C.Cartesian3.fromDegrees(point.longitude, point.latitude, point.altitude)), width: 2, material: color.withAlpha(0.58), arcType: C.ArcType.NONE } });
      }
    }
    this.viewer.scene.requestRender();
  }

  clearSelection() { this.onSelect(null); void this.select(null); }
  destroy() {
    this.removeCameraListener();
    if (this.visibilityFrame !== null) cancelAnimationFrame(this.visibilityFrame);
    this.handler.destroy();
    for (const source of this.sources.values()) this.viewer.dataSources.remove(source, true);
    this.viewer.dataSources.remove(this.selection, true);
    this.sources.clear(); this.signals.clear();
  }
}
