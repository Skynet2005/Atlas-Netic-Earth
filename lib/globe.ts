import type * as Cesium from 'cesium';
import { approachCoordinates, planTerrainApproach, TERRAIN_VIEW_ANGLE } from './terrain-view';
import { CountryLabelOverlay, type CountryLabelRecord } from './country-label-overlay';
import type { TrafficTarget } from './traffic';
import { readCamera, writeCamera, type CameraSnapshot } from './session';
import {destination,distanceKm,bearing,type GeoPoint} from './geo';

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
  private countryLabels: CountryLabelOverlay;
  private traffic: Cesium.CustomDataSource;
  private workspace: Cesium.CustomDataSource;
  private trafficTargets = new Map<string, TrafficTarget>();
  private selectedTrafficId?: string;
  private graphicsQuality: 'eco'|'balanced'|'detail' = 'balanced';
  private lastCameraSave = 0;
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
      creditContainer, requestRenderMode: true, maximumRenderTimeChange: 60,
      showRenderLoopErrors: false, shouldAnimate: true, contextOptions: { webgl: { alpha: false, antialias: true } },
    });
    const v = this.viewer;
    v.scene.backgroundColor = C.Color.fromCssColorString('#050b13');
    v.scene.globe.baseColor = C.Color.fromCssColorString('#173344');
    const mobile = window.matchMedia('(pointer: coarse)').matches || element.clientWidth <= 760;
    this.graphicsQuality = mobile ? 'eco' : 'balanced';
    v.scene.globe.maximumScreenSpaceError = mobile ? 2.5 : 1.5;
    v.scene.globe.tileCacheSize = mobile ? 64 : 128;
    v.scene.globe.preloadAncestors = false;
    v.scene.globe.preloadSiblings = false;
    v.targetFrameRate = mobile ? 30 : 45;
    v.scene.globe.depthTestAgainstTerrain = true;
    v.scene.globe.enableLighting = true;
    v.scene.globe.dynamicAtmosphereLighting = true;
    v.scene.globe.dynamicAtmosphereLightingFromSun = true;
    v.scene.fog.enabled = true;
    v.scene.fog.density = 0.00008;
    v.scene.globe.showGroundAtmosphere = true;
    v.scene.verticalExaggeration = 1;
    v.scene.highDynamicRange = true;
    v.useBrowserRecommendedResolution = false;
    v.resolutionScale = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.25) / (window.devicePixelRatio || 1);
    const control = v.scene.screenSpaceCameraController;
    control.minimumZoomDistance = 35; control.maximumZoomDistance = 50000000;
    control.enableCollisionDetection = true;
    control.tiltEventTypes = [C.CameraEventType.RIGHT_DRAG, C.CameraEventType.MIDDLE_DRAG,
      C.CameraEventType.PINCH, {eventType:C.CameraEventType.LEFT_DRAG, modifier:C.KeyboardEventModifier.CTRL}];
    control.zoomEventTypes = [C.CameraEventType.WHEEL, C.CameraEventType.PINCH];
    v.camera.setView({ destination: C.Cartesian3.fromDegrees(-90, 24, 18000000),
      orientation: { heading: 0, pitch: -C.Math.PI_OVER_TWO, roll: 0 } });
    const saved = readCamera();
    if (saved) this.restoreCamera(saved);
    v.camera.percentageChanged = 0.005;
    this.cleanups.push(v.camera.changed.addEventListener(() => { this.reportView(); this.countryLabels.requestUpdate(); }));
    this.cleanups.push(v.camera.moveEnd.addEventListener(() => { this.reportView(true); this.countryLabels.requestUpdate(); }));
    this.cleanups.push(v.scene.globe.tileLoadProgressEvent.addEventListener((count: number) => {
      if (this.disposed) return;
      const loading = count > 0;
      if (loading !== this.lastLoading) { this.lastLoading = loading; callbacks.onLoading(loading); }
    }));
    this.cleanups.push(v.scene.renderError.addEventListener((_scene, error) => {
      this.saveCamera();
      callbacks.onNotice('render', 'Rendering paused. Recover view keeps your location and uses lighter graphics.');
      console.error('Globe render error', error);
    }));
    this.countryLabels = new CountryLabelOverlay(C, v, element);
    this.traffic = new C.CustomDataSource('transponder-traffic');
    void v.dataSources.add(this.traffic);
    this.workspace = new C.CustomDataSource('workspace-tools');void v.dataSources.add(this.workspace);
    const resize = new ResizeObserver(() => {
      if (this.disposed) return;
      v.resolutionScale = Math.min(window.devicePixelRatio || 1, this.graphicsQuality === 'eco' ? 1 : this.graphicsQuality === 'detail' ? 1.75 : 1.25) / (window.devicePixelRatio || 1);
      v.resize(); this.countryLabels.requestUpdate(); this.render();
    });
    resize.observe(element);
    this.cleanups.push(() => resize.disconnect());
    this.handler = new C.ScreenSpaceEventHandler(v.scene.canvas);
    this.handler.setInputAction((event: {position: Cesium.Cartesian2}) => {
      const target = this.pickTraffic(event.position);
      if (target) {
        this.selectTraffic(target.id); return;
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
    const lost = (event: Event) => { event.preventDefault(); this.saveCamera(); callbacks.onNotice('render', 'Graphics context lost. Recover view restores this location with lighter graphics.'); };
    const background = () => this.saveCamera();
    v.canvas.addEventListener('webglcontextlost', lost);
    document.addEventListener('visibilitychange', background);
    window.addEventListener('pagehide', background);
    this.cleanups.push(() => { v.canvas.removeEventListener('webglcontextlost', lost); document.removeEventListener('visibilitychange', background); window.removeEventListener('pagehide', background); });
    this.reportView(true);
  }
  setWorkspace(points:GeoPoint[],polygon:boolean,ringKm:number,grid:boolean) {
    const C=this.C,ds=this.workspace;ds.entities.removeAll();
    const positions=points.map(p=>C.Cartesian3.fromDegrees(p.longitude,p.latitude));
    points.forEach((p,i)=>ds.entities.add({position:positions[i],point:{pixelSize:8,color:C.Color.CYAN,heightReference:C.HeightReference.CLAMP_TO_GROUND},label:{text:p.name||String(i+1),font:'13px sans-serif',pixelOffset:new C.Cartesian2(0,-20),heightReference:C.HeightReference.CLAMP_TO_GROUND,fillColor:C.Color.WHITE,style:C.LabelStyle.FILL_AND_OUTLINE,outlineWidth:2}}));
    if(points.length>1)ds.entities.add({polyline:{positions,clampToGround:true,width:3,material:C.Color.CYAN}});
    if(polygon&&points.length>2)ds.entities.add({polygon:{hierarchy:positions,material:C.Color.CYAN.withAlpha(0.2),heightReference:C.HeightReference.CLAMP_TO_GROUND}});
    if(ringKm>0&&points.length)for(const scale of [1,2,3])ds.entities.add({position:positions[0],ellipse:{semiMajorAxis:ringKm*1000*scale,semiMinorAxis:ringKm*1000*scale,material:C.Color.CYAN.withAlpha(0.025),outline:true,outlineColor:C.Color.CYAN.withAlpha(0.7),heightReference:C.HeightReference.CLAMP_TO_GROUND}});
    if(grid){
      for(let lat=-80;lat<=80;lat+=10){const coords:number[]=[];for(let lon=-180;lon<=180;lon+=2)coords.push(lon,lat,100);ds.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArrayHeights(coords),width:1,material:C.Color.WHITE.withAlpha(0.25)}});}
      for(let lon=-180;lon<180;lon+=10){const coords:number[]=[];for(let lat=-90;lat<=90;lat+=2)coords.push(lon,lat,100);ds.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArrayHeights(coords),width:1,material:C.Color.WHITE.withAlpha(0.25)}});}
    }this.render();
  }
  fitPoints(points:GeoPoint[]){if(!points.length)return;const C=this.C;this.viewer.camera.flyToBoundingSphere(C.BoundingSphere.fromPoints(points.map(p=>C.Cartesian3.fromDegrees(p.longitude,p.latitude))),{duration:this.duration(1),offset:new C.HeadingPitchRange(0,-C.Math.PI_OVER_TWO,0)});}
  async profile(points:GeoPoint[]){
    if(points.length<2)throw new Error('Add at least two waypoints.');
    const provider=await this.ensureTerrain(),C=this.C;
    const lengths=points.slice(1).map((p,i)=>distanceKm(points[i].latitude,points[i].longitude,p.latitude,p.longitude));
    const total=lengths.reduce((a,b)=>a+b,0);if(total<0.001)throw new Error('Route is too short.');
    const samples:Cesium.Cartographic[]=[];
    for(let i=0;i<=128;i++){let distance=total*i/128,segment=0;while(segment<lengths.length-1&&distance>lengths[segment])distance-=lengths[segment++];const a=points[segment],b=points[segment+1],p=destination(a.latitude,a.longitude,bearing(a.latitude,a.longitude,b.latitude,b.longitude),distance);samples.push(C.Cartographic.fromDegrees(p.longitude,p.latitude));}
    const result=await this.withTimeout(C.sampleTerrain(provider,12,samples),20000);
    return result.map((p,i)=>({km:total*i/128,height:Number.isFinite(p.height)?p.height:null}));
  }
  followTraffic(id:string|null){this.viewer.trackedEntity=id?this.traffic.entities.getById(id):undefined;this.render();}
  showTrail(points:GeoPoint[]){const C=this.C;this.viewer.entities.removeById('selected-trail');if(points.length>1)this.viewer.entities.add({id:'selected-trail',polyline:{positions:points.map(p=>C.Cartesian3.fromDegrees(p.longitude,p.latitude)),clampToGround:true,width:2,material:C.Color.ORANGE}});this.render();}
  setDayNight(enabled:boolean){
    const v=this.viewer;
    v.scene.globe.enableLighting=enabled;
    v.scene.globe.dynamicAtmosphereLighting=enabled;
    v.scene.globe.dynamicAtmosphereLightingFromSun=enabled;
    v.clock.shouldAnimate=enabled;
    v.clock.currentTime=this.C.JulianDate.now();
    v.scene.maximumRenderTimeChange=enabled?60:Infinity;
    this.render();
  }
  appearance(options:{brightness:number;contrast:number;atmosphere:boolean;fog:boolean;stars:boolean}){
    const v=this.viewer;
    v.scene.globe.showGroundAtmosphere=options.atmosphere;if(v.scene.skyAtmosphere)v.scene.skyAtmosphere.show=options.atmosphere;
    v.scene.fog.enabled=options.fog;if(v.scene.skyBox)v.scene.skyBox.show=options.stars;
    for(const layer of [this.satellite,this.relief])if(layer){layer.brightness=options.brightness;layer.contrast=options.contrast;}this.render();
  }
  cameraSnapshot(): CameraSnapshot {
    const C=this.C,c=this.viewer.camera,p=c.positionCartographic;
    return {longitude:C.Math.toDegrees(p.longitude),latitude:C.Math.toDegrees(p.latitude),height:p.height,heading:c.heading,pitch:c.pitch,roll:c.roll};
  }
  saveCamera() { if(this.disposed) return; this.lastCameraSave=performance.now(); writeCamera(this.cameraSnapshot()); }
  restoreCamera(snapshot: CameraSnapshot) {
    this.viewer.trackedEntity=undefined;
    this.viewer.camera.lookAtTransform(this.C.Matrix4.IDENTITY);
    this.viewer.camera.setView({destination:this.C.Cartesian3.fromDegrees(snapshot.longitude,snapshot.latitude,snapshot.height),orientation:{heading:snapshot.heading,pitch:snapshot.pitch,roll:snapshot.roll}});
    this.render();
  }
  setQuality(quality: 'eco'|'balanced'|'detail') {
    this.graphicsQuality=quality;
    const v=this.viewer;
    v.scene.globe.maximumScreenSpaceError=quality==='eco'?2.5:quality==='detail'?0.85:1.5;
    v.scene.globe.tileCacheSize=quality==='eco'?64:quality==='detail'?160:100;
    v.targetFrameRate=quality==='eco'?30:quality==='detail'?60:45;
    v.resolutionScale=Math.min(window.devicePixelRatio||1,quality==='eco'?1:quality==='detail'?1.75:1.25)/(window.devicePixelRatio||1);
    v.resize();this.render();
  }
  selectTraffic(id:string) {
    const target=this.trafficTargets.get(id); if(!target)return;
    this.clearPoint();this.selectedTrafficId=id;this.callbacks.onTraffic(target);this.render();
  }
  private pickTraffic(pixel: Cesium.Cartesian2) {
    const C=this.C,v=this.viewer;
    for(const picked of v.scene.drillPick(pixel,10,44,44)) {
      const id=typeof picked?.id==='string'?picked.id:picked?.id?.id??picked?.primitive?.id?.id;
      if(id && this.trafficTargets.has(id))return this.trafficTargets.get(id);
    }
    // A screen-space fallback makes small touch targets selectable without relying on GPU picking.
    let closest:TrafficTarget|undefined,best=28;
    const ellipsoid=v.scene.globe.ellipsoid,cam=ellipsoid.transformPositionToScaledSpace(v.camera.positionWC,new C.Cartesian3());
    for(const target of this.trafficTargets.values()) {
      const ground=C.Cartesian3.fromDegrees(target.longitude,target.latitude);
      if(C.Cartesian3.dot(cam,ellipsoid.transformPositionToScaledSpace(ground,new C.Cartesian3()))<=1)continue;
      const position=C.Cartesian3.fromDegrees(target.longitude,target.latitude,target.altitude??0);
      if(C.Cartesian3.dot(C.Cartesian3.subtract(position,v.camera.positionWC,new C.Cartesian3()),v.camera.directionWC)<=0)continue;
      const screen=C.SceneTransforms.worldToWindowCoordinates(v.scene,position);
      if(!screen)continue;const distance=Math.hypot(screen.x-pixel.x,screen.y-pixel.y);
      if(distance<best){closest=target;best=distance;}
    }
    return closest;
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
          const countries = await response.json() as CountryLabelRecord[];
          if (this.disposed) return;
          this.countryLabels.load(countries);
          this.countryLabels.setEnabled(this.labelsVisible);
          this.render();
        } catch { if (!this.disposed) this.callbacks.onNotice('labels', 'Country names could not load.'); }
      })(),
    ]);
  }
  setTraffic(targets: TrafficTarget[]) {
    if (this.disposed) return;
    const C = this.C, entities = this.traffic.entities;
    const previousTargets=this.trafficTargets;
    this.trafficTargets = new Map(targets.map(target => [target.id, target]));
    entities.suspendEvents();
    try {
      for (const entity of [...entities.values]) if (!this.trafficTargets.has(entity.id)) entities.remove(entity);
      for (const target of targets) {
        if(previousTargets.get(target.id)===target&&entities.getById(target.id))continue;
        const position = C.Cartesian3.fromDegrees(target.longitude, target.latitude, target.altitude ?? 0);
        let entity = entities.getById(target.id);
        const ground = target.altitudeReference === 'surface' || target.altitude === null;
        const reference = ground ? C.HeightReference.CLAMP_TO_GROUND : C.HeightReference.NONE;
        const orientation = C.Transforms.headingPitchRollQuaternion(position,new C.HeadingPitchRoll(C.Math.toRadians((target.heading ?? 0)-90),0,0));
        if (!entity) {
          // Stable entity/model per report ID. All use two shared cached mesh URLs.
          // Cesium culls offscreen models without destroying them as the camera moves.
          entity = entities.add({id:target.id,name:target.name,position,orientation,
            model:{uri:target.kind==='maritime'?'/models/vessel.gltf':'/models/aircraft.gltf',
              minimumPixelSize:target.kind==='maritime'?28:29,maximumScale:4800,runAnimations:false,incrementallyLoadTextures:false,
              shadows:C.ShadowMode.DISABLED,enableVerticalExaggeration:false,
              heightReference:reference,color:C.Color.fromCssColorString(target.heading===null||target.altitude===null?'#b9bec6':target.kind==='military'?'#ffbd75':target.kind==='maritime'?'#8ecbff':'#a4ecdb'),
              colorBlendMode:C.ColorBlendMode.MIX,colorBlendAmount:0.14,
              silhouetteColor:C.Color.WHITE.withAlpha(0.88),silhouetteSize:1.55}});
        } else {
          entity.name=target.name;
          entity.position=new C.ConstantPositionProperty(position);
          entity.orientation=new C.ConstantProperty(orientation);
          if(entity.model){entity.model.heightReference=new C.ConstantProperty(reference);entity.model.color=new C.ConstantProperty(C.Color.fromCssColorString(target.heading===null||target.altitude===null?'#b9bec6':target.kind==='military'?'#ffbd75':target.kind==='maritime'?'#8ecbff':'#a4ecdb'));}
        }
      }
    } finally { entities.resumeEvents(); }
    if (this.selectedTrafficId) {
      const selected = this.trafficTargets.get(this.selectedTrafficId);
      if (selected) this.callbacks.onTraffic(selected); // Keep an opened report available when it leaves the feed.
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
    if(force || performance.now()-this.lastCameraSave>1000) this.saveCamera();
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
  setLabels(enabled:boolean) { this.labelsVisible=enabled; this.countryLabels.setEnabled(enabled); this.render(); }
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
      heightReference:C.HeightReference.CLAMP_TO_GROUND,disableDepthTestDistance:0,
    }}); this.render();
    if(!this.terrain||!covered) return;
    try {
      const positions=await C.sampleTerrainMostDetailed(this.terrain,[C.Cartographic.fromDegrees(lng,lat)]);
      if(this.disposed || id!==this.sampleId) return;
      this.callbacks.onPoint({latitude:lat,longitude:lng,height:Number.isFinite(positions[0].height)?positions[0].height:null,pending:false});
    } catch { if(!this.disposed && id===this.sampleId) this.callbacks.onPoint({latitude:lat,longitude:lng,height:null,pending:false}); }
  }
  clearPoint() { this.selectedPoint=undefined; ++this.sampleId; if(this.pin) {this.viewer.entities.remove(this.pin);this.pin=undefined;} this.callbacks.onPoint(null);this.render(); }
  destroy() { this.saveCamera(); ++this.navigationId; this.disposed=true;++this.sampleId;this.cleanups.forEach(fn=>fn());this.handler.destroy();this.countryLabels.destroy();if(!this.viewer.isDestroyed()) this.viewer.destroy(); }
}
