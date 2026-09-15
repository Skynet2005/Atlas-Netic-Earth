import type * as Cesium from 'cesium';
import { approachCoordinates, planTerrainApproach, TERRAIN_VIEW_ANGLE } from './terrain-view';
import { showCountryLabels } from './country-labels';
import type { TrafficTarget } from './traffic';

type CModule = typeof Cesium;
declare global { interface Window { Cesium?: CModule; CESIUM_BASE_URL?: string } }
export type Surface = 'satellite' | 'relief';
export type ViewInfo = { latitude: number; longitude: number; altitude: number; heading: number; pitch: number; range: number };
export type TerrainPoint = { latitude: number; longitude: number; height: number | null; pending: boolean };
export type GlobeCallbacks = {
  onView: (v: ViewInfo) => void;
  onPoint: (p: TerrainPoint | null) => void;
  onTerrain: (ready: boolean) => void;
  onNavigating: (active: boolean) => void;
  onLoading: (loading: boolean) => void;
  onNotice: (key: string, message: string | null) => void;
  onTraffic: (target: TrafficTarget | null) => void;
};
export const TERRAIN_URL = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer';
const IMAGERY_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer';
const HILLSHADE_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer';
const RELIEF_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer';
let scriptPromise: Promise<CModule> | undefined;
export function loadCesium(): Promise<CModule> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (scriptPromise) return scriptPromise;
  window.CESIUM_BASE_URL = '/cesium/';
  scriptPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('#cesium-style')) {
      const link = document.createElement('link');
      link.id = 'cesium-style'; link.rel = 'stylesheet'; link.href = '/cesium/Widgets/widgets.css';
      document.head.appendChild(link);
    }
    const script = document.createElement('script');
    script.src = '/cesium/Cesium.js'; script.async = true;
    script.onload = () => window.Cesium ? resolve(window.Cesium) : reject(new Error('Globe engine did not load.'));
    script.onerror = () => { scriptPromise = undefined; script.remove(); reject(new Error('The globe could not load. Check your connection and retry.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export class Globe {
  readonly viewer: Cesium.Viewer;
  private C: CModule;
  private callbacks: GlobeCallbacks;
  private terrain?: Cesium.ArcGISTiledElevationTerrainProvider;
  private terrainLoading?: Promise<Cesium.ArcGISTiledElevationTerrainProvider>;
  private hillshade?: Cesium.ImageryLayer;
  private hillshadeLoading?: Promise<void>;
  private shadingEnabled = true;
  private navigationId = 0;
  private lastFocus?: {longitude:number;latitude:number};
  private selectedPoint?: { longitude: number; latitude: number };
  private satellite?: Cesium.ImageryLayer;
  private relief?: Cesium.ImageryLayer;
  private reliefLoading?: Promise<Cesium.ImageryLayer | undefined>;
  private borders?: Cesium.GeoJsonDataSource;
  private labels: Cesium.LabelCollection;
  private countryAnchors: { label: Cesium.Label; position: Cesium.Cartesian3; maximumDistance: number }[] = [];
  private traffic: Cesium.CustomDataSource;
  private trafficTargets = new Map<string, TrafficTarget>();
  private selectedTrafficId?: string;
  private pin?: Cesium.Entity;
  private handler: Cesium.ScreenSpaceEventHandler;
  private cleanups: (() => void)[] = [];
  private disposed = false;
  private sampleId = 0;
  private lastViewTime = 0;
  private lastLoading?: boolean;
  private bordersVisible = true;
  private labelsVisible = true;
  private desiredTerrain = true;
  private desiredSurface: Surface = 'satellite';
  private desiredExaggeration = 1;

  constructor(C: CModule, element: HTMLElement, creditContainer: HTMLElement, callbacks: GlobeCallbacks) {
    this.C = C; this.callbacks = callbacks;
    C.Ion.defaultAccessToken = '';
    const naturalEarth = new C.UrlTemplateImageryProvider({
      url: '/cesium/Assets/Textures/NaturalEarthII/{z}/{x}/{reverseY}.jpg',
      tilingScheme: new C.GeographicTilingScheme(), maximumLevel: 2,
      credit: new C.Credit('Natural Earth'),
    });
    this.viewer = new C.Viewer(element, {
      baseLayer: new C.ImageryLayer(naturalEarth),
      terrainProvider: new C.EllipsoidTerrainProvider(),
      animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
      homeButton: false, sceneModePicker: false, navigationHelpButton: false,
      fullscreenButton: false, selectionIndicator: false, infoBox: false,
      creditContainer, requestRenderMode: true, maximumRenderTimeChange: Infinity,
      shouldAnimate: false, contextOptions: { webgl: { alpha: false, antialias: true } },
    });
    const v = this.viewer;
    v.scene.backgroundColor = C.Color.fromCssColorString('#050b13');
    v.scene.globe.baseColor = C.Color.fromCssColorString('#173344');
    v.scene.globe.maximumScreenSpaceError = 0.85;
    v.scene.globe.tileCacheSize = 240;
    v.scene.globe.depthTestAgainstTerrain = true;
    v.scene.globe.enableLighting = false;
    v.scene.fog.enabled = true;
    v.scene.fog.density = 0.00008;
    v.scene.globe.showGroundAtmosphere = true;
    v.scene.verticalExaggeration = 1;
    v.scene.highDynamicRange = false;
    v.useBrowserRecommendedResolution = false;
    v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.75) / (window.devicePixelRatio || 1);
    const control = v.scene.screenSpaceCameraController;
    control.minimumZoomDistance = 35; control.maximumZoomDistance = 50000000;
    control.enableCollisionDetection = true;
    control.tiltEventTypes = [C.CameraEventType.RIGHT_DRAG, C.CameraEventType.MIDDLE_DRAG,
      C.CameraEventType.PINCH, {eventType:C.CameraEventType.LEFT_DRAG, modifier:C.KeyboardEventModifier.CTRL}];
    control.zoomEventTypes = [C.CameraEventType.WHEEL, C.CameraEventType.PINCH];
    v.camera.setView({ destination: C.Cartesian3.fromDegrees(-90, 24, 18000000),
      orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
    v.camera.percentageChanged = 0.02;
    this.cleanups.push(v.camera.changed.addEventListener(() => this.reportView()));
    this.cleanups.push(v.camera.moveEnd.addEventListener(() => this.reportView(true)));
    this.cleanups.push(v.scene.globe.tileLoadProgressEvent.addEventListener((count: number) => {
      if (this.disposed) return;
      const loading = count > 0;
      if (loading !== this.lastLoading) { this.lastLoading = loading; callbacks.onLoading(loading); }
    }));
    this.cleanups.push(v.scene.renderError.addEventListener((_scene, error) => {
      callbacks.onNotice('render', '3D rendering paused. Reload the globe to continue.');
      console.error('Globe render error', error);
    }));
    this.labels = v.scene.primitives.add(new C.LabelCollection({ scene: v.scene }));
    this.traffic = new C.CustomDataSource('transponder-traffic');
    void v.dataSources.add(this.traffic);
    this.cleanups.push(v.scene.preRender.addEventListener(() => this.updateCountryLabels()));
    const resize = new ResizeObserver(() => {
      if (this.disposed) return;
      v.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.75) / (window.devicePixelRatio || 1);
      v.resize(); this.render();
    });
    resize.observe(element);
    this.cleanups.push(() => resize.disconnect());
    this.handler = new C.ScreenSpaceEventHandler(v.scene.canvas);
    this.handler.setInputAction((event: {position: Cesium.Cartesian2}) => {
      const picked = v.scene.pick(event.position);
      const target = picked?.id instanceof C.Entity ? this.trafficTargets.get(picked.id.id) : undefined;
      if (target) {
        this.clearPoint(); this.selectedTrafficId = target.id; this.callbacks.onTraffic(target); return;
      }
      this.clearTrafficSelection();
      const ray = v.camera.getPickRay(event.position);
      const point = ray && v.scene.globe.pick(ray, v.scene);
      if (point) {
        const location = C.Cartographic.fromCartesian(point);
        void this.inspect(C.Math.toDegrees(location.longitude), C.Math.toDegrees(location.latitude));
      }
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    v.cesiumWidget.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    this.handler.setInputAction((event: {position: Cesium.Cartesian2}) => {
      const ray = v.camera.getPickRay(event.position);
      const point = ray && v.scene.globe.pick(ray, v.scene);
      if (point) {
        const distance = C.Cartesian3.distance(v.camera.positionWC, point);
        v.camera.flyToBoundingSphere(new C.BoundingSphere(point, 1), {
          duration: this.duration(0.7), offset: new C.HeadingPitchRange(v.camera.heading, v.camera.pitch, Math.max(500, distance * 0.42)),
        });
      }
    }, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    const interrupt = () => { this.lastFocus=undefined;this.cancelNavigation(); };
    v.canvas.addEventListener('pointerdown', interrupt);
    v.canvas.addEventListener('wheel', interrupt, { passive: true });
    this.cleanups.push(() => { v.canvas.removeEventListener('pointerdown', interrupt); v.canvas.removeEventListener('wheel', interrupt); });
    this.reportView(true);
  }
  private duration(seconds: number) { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : seconds; }
  private render() { if (!this.disposed) this.viewer.scene.requestRender(); }
  private async imagery(url: string) {
    const provider = await this.C.ArcGisMapServerImageryProvider.fromUrl(url, {enablePickFeatures:false});
    if (this.disposed) return undefined;
    let failures = 0;
    this.cleanups.push(provider.errorEvent.addEventListener(() => {
      if (++failures === 3) this.callbacks.onNotice('imagery', 'Some image tiles are unavailable here. Try the other surface view.');
    }));
    return this.viewer.imageryLayers.addImageryProvider(provider);
  }
  async initialize() {
    const C = this.C;
    await Promise.allSettled([
      (async () => {
        try {
          this.satellite = await this.imagery(IMAGERY_URL);
          if (!this.disposed) this.setSurface(this.desiredSurface);
        } catch { if (!this.disposed) this.callbacks.onNotice('imagery', 'Satellite imagery is unavailable. Showing the Natural Earth overview.'); }
      })(),
      this.ensureTerrain(),
      (async () => {
        try {
          const ds = await C.GeoJsonDataSource.load('/data/borders.geojson', {
            clampToGround: true, stroke: C.Color.fromCssColorString('#e7e7c7').withAlpha(0.72), strokeWidth: 1.5,
          });
          if (this.disposed) return;
          for (const entity of ds.entities.values) {
            const category = entity.properties?.featurecla?.getValue();
            if (entity.polyline && /disput|control|indefinit|indeterm|unrecognized/i.test(category || '')) {
              entity.polyline.material = new C.PolylineDashMaterialProperty({ color:C.Color.fromCssColorString('#f3c887'), dashLength:12 });
            }
          }
          ds.show = this.bordersVisible; this.borders = ds;
          await this.viewer.dataSources.add(ds); this.render();
        } catch { if (!this.disposed) this.callbacks.onNotice('borders', 'Country borders could not load. Reload to try again.'); }
      })(),
      (async () => {
        try {
          const response = await fetch('/data/countries.json'); if (!response.ok) throw new Error('Labels unavailable');
          const countries = await response.json() as {name:string;lat:number;lng:number;size:number}[];
          if (this.disposed) return;
          for (const country of countries.sort((a,b) => a.size-b.size)) {
            if (!Number.isFinite(country.lat) || !Number.isFinite(country.lng)) continue;
            // Fixed geodetic anchors avoid asynchronous terrain-clamp positions lingering after zooms.
            // Explicit horizon and viewport culling below permits overlay text without showing far-side labels.
            const position = C.Cartesian3.fromDegrees(country.lng,country.lat);
            const label = this.labels.add({position,
              text:country.name, font:'500 13px Arial', fillColor:C.Color.fromCssColorString('#eef4f8').withAlpha(0.87),
              outlineColor:C.Color.fromCssColorString('#0a1724'), outlineWidth:3, style:C.LabelStyle.FILL_AND_OUTLINE,
              heightReference:C.HeightReference.NONE, disableDepthTestDistance:Number.POSITIVE_INFINITY,
              scaleByDistance:new C.NearFarScalar(100000,0.9,30000000,0.8),
            });
            this.countryAnchors.push({label,position,maximumDistance:country.size<=2?32000000:country.size<=4?11500000:4500000});
          }
          this.updateCountryLabels(); this.render();
        } catch { if (!this.disposed) this.callbacks.onNotice('labels', 'Country names could not load.'); }
      })(),
    ]);
  }
  private updateCountryLabels() {
    if (this.disposed) return;
    const C = this.C, v = this.viewer, camera = v.camera, width = v.canvas.clientWidth, height = v.canvas.clientHeight;
    this.labels.show = showCountryLabels(this.labelsVisible, camera.positionCartographic.height, width, C.Math.toDegrees(camera.pitch));
    if (!this.labels.show) return;
    const ellipsoid = v.scene.globe.ellipsoid;
    const scaledCamera = ellipsoid.transformPositionToScaledSpace(camera.positionWC, new C.Cartesian3());
    const occupied: { x: number; y: number; halfWidth: number }[] = [];
    const direction = new C.Cartesian3();
    for (const { label, position, maximumDistance } of this.countryAnchors) {
      // On a unit sphere a surface anchor is beyond the horizon when camera · anchor <= 1.
      const scaledAnchor = ellipsoid.transformPositionToScaledSpace(position, new C.Cartesian3());
      if (C.Cartesian3.dot(scaledCamera, scaledAnchor) <= 1.002 || C.Cartesian3.distance(camera.positionWC, position) > maximumDistance) { label.show = false; continue; }
      if (C.Cartesian3.dot(C.Cartesian3.subtract(position, camera.positionWC, direction), camera.directionWC) <= 0) { label.show = false; continue; }
      const screen = C.SceneTransforms.worldToWindowCoordinates(v.scene, position);
      const halfWidth = Math.max(24, label.text.length * 3.4);
      if (!screen || screen.x < halfWidth || screen.x > width-halfWidth || screen.y < 20 || screen.y > height-20) { label.show = false; continue; }
      if (occupied.some(other => Math.abs(screen.x-other.x) < halfWidth+other.halfWidth+10 && Math.abs(screen.y-other.y) < 26)) { label.show = false; continue; }
      label.show = true;
      occupied.push({ x: screen.x, y: screen.y, halfWidth });
    }
  }

  setTraffic(targets: TrafficTarget[]) {
    if (this.disposed) return;
    const C = this.C, entities = this.traffic.entities;
    this.trafficTargets = new Map(targets.map(target => [target.id, target]));
    entities.suspendEvents();
    try {
      for (const entity of [...entities.values]) if (!this.trafficTargets.has(entity.id)) entities.remove(entity);
      for (const target of targets) {
        const position = C.Cartesian3.fromDegrees(target.longitude, target.latitude, Math.max(0, target.altitude ?? 0));
        const north = C.Matrix4.multiplyByPointAsVector(C.Transforms.eastNorthUpToFixedFrame(position), C.Cartesian3.UNIT_Y, new C.Cartesian3());
        let entity = entities.getById(target.id);
        if (!entity) {
          const color = target.kind === 'military' ? '#ffbd75' : target.kind === 'maritime' ? '#8ecbff' : '#a4ecdb';
          const shape = target.kind === 'maritime' ? 'M16 3L24 12V26L16 30L8 26V12Z' : 'M16 2L19 12L29 19V22L19 19L18 27L22 29V31L16 29L10 31V29L14 27L13 19L3 22V19L13 12Z';
          const image = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="${shape}" fill="${color}" stroke="#081421" stroke-width="1.5"/></svg>`)}`;
          entity = entities.add({ id: target.id, name: target.name, position, billboard: {
            image, width: target.kind === 'maritime' ? 18 : 22, height: target.kind === 'maritime' ? 18 : 22,
            heightReference: target.altitudeReference === 'surface' || target.altitude === null ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE,
            disableDepthTestDistance: 0, alignedAxis: north, rotation: C.Math.toRadians(-(target.heading ?? 0)),
            scaleByDistance: new C.NearFarScalar(1000, 1.2, 20000000, 0.7),
          } });
        } else {
          entity.name = target.name;
          entity.position = new C.ConstantPositionProperty(position);
          if (entity.billboard) {
            entity.billboard.rotation = new C.ConstantProperty(C.Math.toRadians(-(target.heading ?? 0)));
            entity.billboard.alignedAxis = new C.ConstantProperty(north);
            entity.billboard.heightReference = new C.ConstantProperty(target.altitudeReference === 'surface' || target.altitude === null ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE);
          }
        }
      }
    } finally { entities.resumeEvents(); }
    if (this.selectedTrafficId) {
      const selected = this.trafficTargets.get(this.selectedTrafficId);
      if (selected) this.callbacks.onTraffic(selected); else this.clearTrafficSelection();
    }
    this.render();
  }
  clearTrafficSelection() { this.selectedTrafficId = undefined; this.callbacks.onTraffic(null); }
  overview(lng: number, lat: number, altitude = 650000) {
    this.cancelNavigation(); this.clearPoint(); this.clearTrafficSelection();
    this.viewer.camera.flyTo({ destination: this.C.Cartesian3.fromDegrees(lng, lat, altitude), duration: this.duration(1.6),
      orientation: { heading: 0, pitch: -this.C.Math.PI_OVER_TWO, roll: 0 } });
  }
  private ensureTerrain() {
    this.terrainLoading ??= this.C.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL).then(terrain => {
      if (this.disposed) throw new Error('Globe closed.');
      this.terrain = terrain;
      let failures = 0;
      this.cleanups.push(terrain.errorEvent.addEventListener(() => {
        if (++failures === 3) this.callbacks.onNotice('terrain-tiles', 'Some terrain tiles are unavailable. Try another area or reload data.');
      }));
      this.setTerrain(this.desiredTerrain);
      this.callbacks.onTerrain(true);
      this.callbacks.onNotice('terrain', null);
      return terrain;
    }).catch(error => {
      if (!this.disposed) {
        this.callbacks.onTerrain(false);
        this.callbacks.onNotice('terrain', 'Elevation data is unavailable. Reload data to restore 3D terrain.');
      }
      throw error;
    });
    return this.terrainLoading;
  }
  private updateTerrainAppearance() {
    if (this.disposed) return;
    const close = this.viewer.camera.positionCartographic.height < 600000;
    const show = this.shadingEnabled && this.desiredTerrain && this.desiredSurface === 'satellite' && close;
    if (show && !this.hillshade && !this.hillshadeLoading) {
      this.hillshadeLoading = this.imagery(HILLSHADE_URL).then(layer => {
        if (this.disposed || !layer) return;
        this.hillshade = layer;
        layer.alpha = 0.28;
        layer.brightness = 1.1;
        layer.contrast = 1.45;
        this.updateTerrainAppearance();
      }).catch(() => {
        if (!this.disposed) this.callbacks.onNotice('shading', 'Terrain shading is unavailable. The 3D surface is still active.');
      });
    }
    if (this.hillshade) {
      const changed = this.hillshade.show !== show;
      this.hillshade.show = show;
      if (show) this.viewer.imageryLayers.raiseToTop(this.hillshade);
      if (changed) this.render();
    }
  }
  setShading(enabled: boolean) { this.shadingEnabled = enabled; this.updateTerrainAppearance(); this.render(); }
  private cancelNavigation() {
    ++this.navigationId;
    this.viewer.camera.cancelFlight();
    this.callbacks.onNavigating(false);
  }
  private async withTimeout<T>(promise: Promise<T>, milliseconds = 12000): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([promise, new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Terrain is taking too long to load. Try again once detail finishes loading.')), milliseconds);
      })]);
    } finally { if (timeout) clearTimeout(timeout); }
  }
  reportView(force=false) {
    if(this.disposed || (!force && performance.now()-this.lastViewTime<140)) return;
    this.lastViewTime=performance.now();
    const C=this.C, camera=this.viewer.camera, position=camera.positionCartographic;
    const center=this.center(); const geo=center?C.Cartographic.fromCartesian(center):position;
    this.updateTerrainAppearance();
    this.callbacks.onView({latitude:C.Math.toDegrees(geo.latitude),longitude:C.Math.toDegrees(geo.longitude),
      altitude:position.height,heading:C.Math.toDegrees(camera.heading),pitch:C.Math.toDegrees(camera.pitch),
      range:center?C.Cartesian3.distance(camera.positionWC,center):position.height});
  }
  private center() {
    const v=this.viewer, C=this.C;
    const ray=v.camera.getPickRay(new C.Cartesian2(v.canvas.clientWidth/2,v.canvas.clientHeight/2));
    return ray ? v.scene.globe.pick(ray,v.scene) ?? v.camera.pickEllipsoid(new C.Cartesian2(v.canvas.clientWidth/2,v.canvas.clientHeight/2),v.scene.globe.ellipsoid) : undefined;
  }
  async setSurface(surface: Surface) {
    this.desiredSurface=surface;
    if(surface==='relief' && !this.relief) {
      try {
        this.reliefLoading ??= this.imagery(RELIEF_URL);
        this.relief=await this.reliefLoading;
      }
      catch { if(!this.disposed) this.callbacks.onNotice('relief','Shaded relief could not load. Satellite imagery remains available.'); return; }
    }
    if(this.disposed) return;
    if(this.satellite) this.satellite.show=this.desiredSurface==='satellite';
    if(this.relief) this.relief.show=this.desiredSurface==='relief';
    this.callbacks.onNotice('imagery',null); this.updateTerrainAppearance(); this.render();
  }
  setTerrain(enabled:boolean) {
    if (!enabled && this.desiredTerrain) this.cancelNavigation();
    this.desiredTerrain=enabled;
    if (enabled && this.terrain) {
      if (this.viewer.terrainProvider !== this.terrain) this.viewer.terrainProvider = this.terrain;
    } else if (!(this.viewer.terrainProvider instanceof this.C.EllipsoidTerrainProvider)) {
      this.viewer.terrainProvider = new this.C.EllipsoidTerrainProvider();
    }
    this.viewer.scene.verticalExaggeration=enabled?this.desiredExaggeration:1; this.updateTerrainAppearance(); this.render();
  }
  setBorders(enabled:boolean) { this.bordersVisible=enabled; if(this.borders) this.borders.show=enabled; this.render(); }
  setLabels(enabled:boolean) { this.labelsVisible=enabled; this.updateCountryLabels(); this.render(); }
  setExaggeration(value:number) { this.desiredExaggeration=value; this.viewer.scene.verticalExaggeration=this.desiredTerrain?value:1; this.render(); }
  async setAngle(angle:number) {
    const C=this.C, camera=this.viewer.camera, center=this.center();
    if(!center) { this.home(); return; }
    if (angle < 78) {
      const geo = C.Cartographic.fromCartesian(center);
      const target = this.selectedPoint ?? this.lastFocus ?? {longitude:C.Math.toDegrees(geo.longitude),latitude:C.Math.toDegrees(geo.latitude)};
      await this.goTo(target.longitude,target.latitude,C.Cartesian3.distance(camera.positionWC,center),angle,C.Math.toDegrees(camera.heading));
      return;
    }
    this.cancelNavigation();
    camera.flyToBoundingSphere(new C.BoundingSphere(center,1),{duration:this.duration(0.9),
      offset:new C.HeadingPitchRange(camera.heading,C.Math.toRadians(-angle),C.Cartesian3.distance(camera.positionWC,center))});
  }
  north() {
    this.cancelNavigation();
    const C=this.C, camera=this.viewer.camera, center=this.center();
    if(center) camera.flyToBoundingSphere(new C.BoundingSphere(center,1),{duration:this.duration(0.7),
      offset:new C.HeadingPitchRange(0,camera.pitch,C.Cartesian3.distance(camera.positionWC,center))});
  }
  zoom(direction:1|-1) {
    this.cancelNavigation();
    const camera=this.viewer.camera, center=this.center();
    const distance=center?this.C.Cartesian3.distance(camera.positionWC,center):camera.positionCartographic.height;
    const amount=Math.max(10,distance*0.35);
    const ground=this.viewer.scene.globe.getHeight(camera.positionCartographic) ?? 0;
    const clearance=camera.positionCartographic.height-ground*this.viewer.scene.verticalExaggeration;
    if(direction===1 && clearance>80) camera.zoomIn(Math.min(amount,(clearance-50)*0.65));
    if(direction===-1 && camera.positionCartographic.height<49000000) camera.zoomOut(Math.min(amount,50000000-camera.positionCartographic.height));
    this.render(); this.reportView(true);
  }
  home() {
    this.cancelNavigation();
    this.lastFocus=undefined;
    this.clearPoint();
    this.viewer.camera.flyTo({destination:this.C.Cartesian3.fromDegrees(-90,24,18000000),duration:this.duration(1.8),
      orientation:{heading:0,pitch:-this.C.Math.PI_OVER_TWO,roll:0}});
  }
  async goTo(lng:number,lat:number,range=14000,angle=TERRAIN_VIEW_ANGLE,heading=0) {
    this.cancelNavigation();
    const id = this.navigationId, C = this.C;
    this.callbacks.onNavigating(true);
    this.callbacks.onNotice('focus', null);
    try {
      if (Math.abs(lat) > 85.05112878) {
        this.callbacks.onNotice('focus', 'Showing polar imagery. Detailed elevation is unavailable beyond approximately 85° latitude.');
        this.viewer.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(lng,lat),1),{
          duration:this.duration(2),
          offset:new C.HeadingPitchRange(C.Math.toRadians(heading),-C.Math.PI_OVER_TWO,18000),
          complete:()=>{ if(!this.disposed&&id===this.navigationId){this.callbacks.onNavigating(false);this.reportView(true);} },
          cancel:()=>{ if(!this.disposed&&id===this.navigationId)this.callbacks.onNavigating(false); },
        });
        return;
      }
      const provider = await this.withTimeout(this.ensureTerrain());
      if (this.disposed || id !== this.navigationId) return;
      this.setTerrain(true);
      const sampleRange = Math.max(1200,Math.min(range,18000));
      const locations = approachCoordinates(lng,lat,sampleRange,angle,heading);
      const positions = locations.map(point => C.Cartographic.fromDegrees(point.longitude,point.latitude));
      const samples = await this.withTimeout(C.sampleTerrain(provider,14,positions));
      if (this.disposed || id !== this.navigationId) return;
      if (!Number.isFinite(samples[0].height)) throw new Error('Terrain height is unavailable here. Select another point or try again.');
      const heights = samples.map(point => point.height).filter(Number.isFinite);
      let approach = planTerrainApproach({range:sampleRange,angle,height:samples[0].height,
        maximumHeight:Math.max(...heights),exaggeration:this.desiredExaggeration});
      // A second pass checks the entire route when extra clearance moves the camera farther away.
      if (approach.range > sampleRange * 1.1) {
        const extended = approachCoordinates(lng,lat,approach.range,approach.angle,heading)
          .map(point => C.Cartographic.fromDegrees(point.longitude,point.latitude));
        const extra = await this.withTimeout(C.sampleTerrain(provider,14,extended));
        if (this.disposed || id !== this.navigationId) return;
        approach = planTerrainApproach({range:approach.range,angle,height:samples[0].height,
          maximumHeight:Math.max(...heights,...extra.map(point=>point.height).filter(Number.isFinite)),exaggeration:this.desiredExaggeration});
      }
      this.lastFocus={longitude:lng,latitude:lat};
      const target=C.Cartesian3.fromDegrees(lng,lat,approach.height);
      this.viewer.camera.flyToBoundingSphere(new C.BoundingSphere(target,1),{
        duration:this.duration(2.1),
        offset:new C.HeadingPitchRange(C.Math.toRadians(heading),C.Math.toRadians(-approach.angle),approach.range),
        complete:()=>{ if (!this.disposed && id===this.navigationId) { this.callbacks.onNavigating(false);this.reportView(true); } },
        cancel:()=>{ if (!this.disposed && id===this.navigationId) this.callbacks.onNavigating(false); },
      });
      this.render();
    } catch (error) {
      if (!this.disposed && id === this.navigationId) {
        this.callbacks.onNavigating(false);
        this.callbacks.onNotice('focus',error instanceof Error?error.message:'Terrain could not be positioned. Try again.');
      }
    }
  }
  async inspect(lng:number,lat:number) {
    const id=++this.sampleId, C=this.C;
    this.selectedPoint={longitude:lng,latitude:lat};
    const covered=Math.abs(lat)<=85.05112878;
    this.callbacks.onPoint({latitude:lat,longitude:lng,height:null,pending:!!this.terrain&&covered});
    if(this.pin) this.viewer.entities.remove(this.pin);
    this.pin=this.viewer.entities.add({position:C.Cartesian3.fromDegrees(lng,lat),point:{
      pixelSize:10,color:C.Color.fromCssColorString('#a4ecdb'),outlineColor:C.Color.WHITE,outlineWidth:2,
      heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:Number.POSITIVE_INFINITY,
    }}); this.render();
    if(!this.terrain||!covered) return;
    try {
      const positions=await C.sampleTerrainMostDetailed(this.terrain,[C.Cartographic.fromDegrees(lng,lat)]);
      if(this.disposed || id!==this.sampleId) return;
      this.callbacks.onPoint({latitude:lat,longitude:lng,height:Number.isFinite(positions[0].height)?positions[0].height:null,pending:false});
    } catch { if(!this.disposed && id===this.sampleId) this.callbacks.onPoint({latitude:lat,longitude:lng,height:null,pending:false}); }
  }
  clearPoint() { this.selectedPoint=undefined; ++this.sampleId; if(this.pin) {this.viewer.entities.remove(this.pin);this.pin=undefined;} this.callbacks.onPoint(null);this.render(); }
  destroy() { ++this.navigationId; this.disposed=true;++this.sampleId;this.cleanups.forEach(fn=>fn());this.handler.destroy();if(!this.viewer.isDestroyed()) this.viewer.destroy(); }
}
