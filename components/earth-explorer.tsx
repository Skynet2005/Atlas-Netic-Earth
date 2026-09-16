"use client";

import {useAltitude} from '@/hooks/use-altitude';
import {formatAltitude} from '@/lib/altitude';
import {AltitudeUnits} from '@/components/altitude-units';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, ChevronDown, Compass, Crosshair, Globe2, Info, Layers3, LocateFixed, Minus, Mountain, Navigation2, Plus, RotateCcw, Satellite, Settings2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Globe, loadCesium, type Surface, type TerrainPoint, type ViewInfo } from '@/lib/globe';
import { GLOBE_VIEW_RANGE, TERRAIN_PLACES, TERRAIN_VIEW_ANGLE, nearestTerrainPlace } from '@/lib/terrain-view';
import { TrafficPanel } from '@/components/traffic-panel';
import { useTraffic } from '@/hooks/use-traffic';
import type { TrafficLayers, TrafficTarget } from '@/lib/traffic';

const ToolsDrawer=dynamic(()=>import('@/components/tools-drawer'),{ssr:false});

function coordinate(value:number, positive:string,negative:string) { return `${Math.abs(value).toFixed(3)}° ${value>=0?positive:negative}`; }

function ToolButton({label,children,onClick,active=false,disabled=false}:{label:string;children:React.ReactNode;onClick:()=>void;active?:boolean;disabled?:boolean}) {
  return <Tooltip><TooltipTrigger asChild><button type="button" className={`tool-button ${active?'active':''}`} aria-label={label} disabled={disabled} onClick={onClick}>{children}</button></TooltipTrigger><TooltipContent side="left">{label}</TooltipContent></Tooltip>;
}
export default function EarthExplorer() {
  const {unit}=useAltitude();
  const canvasRef=useRef<HTMLDivElement>(null),creditRef=useRef<HTMLDivElement>(null),globeRef=useRef<Globe|null>(null);
  const [ready,setReady]=useState(false),[fatal,setFatal]=useState(''),[retry,setRetry]=useState(0);
  const [terrainReady,setTerrainReady]=useState(false),[loading,setLoading]=useState(true);
  const [navigating,setNavigating]=useState(false),[shading,setShading]=useState(true);
  const [angleDraft,setAngleDraft]=useState<number|null>(null);
  const [surface,setSurface]=useState<Surface>('satellite'),[terrain,setTerrain]=useState(true);
  const [borders,setBorders]=useState(true),[labels,setLabels]=useState(true),[exaggeration,setExaggeration]=useState(1);
  const [view,setView]=useState<ViewInfo>({latitude:24,longitude:-90,altitude:18000000,heading:0,pitch:-90,range:18000000});
  const [point,setPoint]=useState<TerrainPoint|null>(null),[notices,setNotices]=useState<Record<string,string>>({});
  const [panelOpen,setPanelOpen]=useState(false),[coordinates,setCoordinates]=useState(''),[coordinateError,setCoordinateError]=useState('');
  const [location,setLocation]=useState('Planet Earth');
  const [toolsOpen,setToolsOpen]=useState(false),[toolsLoaded,setToolsLoaded]=useState(false),[trafficPaused,setTrafficPaused]=useState(false);
  const getGlobe=useCallback(()=>globeRef.current,[]);
  const openTools=useCallback(()=>{setToolsLoaded(true);setToolsOpen(true);setPanelOpen(false);},[]);
  const closeTools=useCallback(()=>setToolsOpen(false),[]);
  const [trafficLayers,setTrafficLayers]=useState<TrafficLayers>({air:false,military:false,maritime:false});
  const [selectedTraffic,setSelectedTraffic]=useState<TrafficTarget|null>(null);
  const trafficFeeds=useTraffic(trafficLayers,ready,view.latitude,view.longitude,trafficPaused);
  const trafficTargets=useMemo(()=>[...trafficFeeds.air.targets,...trafficFeeds.maritime.targets].filter(target=>trafficLayers[target.kind]),[trafficFeeds.air.targets,trafficFeeds.maritime.targets,trafficLayers]);
  const notice=useCallback((key:string,message:string|null)=>setNotices(previous=>{const next={...previous};if(message) next[key]=message;else delete next[key];return next;}),[]);
  const reloadGlobe=()=>{
    globeRef.current?.saveCamera();
    setReady(false);setFatal('');setTerrainReady(false);setLoading(true);setNotices({});setNavigating(false);
    setAngleDraft(null);setSelectedTraffic(null);setPoint(null);setRetry(value=>value+1);
  };
  useEffect(()=>{
    let cancelled=false,engine:Globe|undefined;
    void (async()=>{
      try {
        const C=await loadCesium();
        if(cancelled||!canvasRef.current||!creditRef.current)return;
        engine=new Globe(C,canvasRef.current,creditRef.current,{
          onView:setView,onPoint:setPoint,onTerrain:setTerrainReady,onNavigating:active=>{setNavigating(active);if(!active)setAngleDraft(null);},onLoading:setLoading,onNotice:notice,onTraffic:setSelectedTraffic,
        });
        globeRef.current=engine;if(retry>0)engine.setQuality('eco');setReady(true);
        await engine.initialize();
      } catch(error) {if(!cancelled)setFatal(error instanceof Error?error.message:'Your browser could not start the 3D globe.');}
    })();
    return()=>{cancelled=true;globeRef.current=null;engine?.destroy();};
  },[retry,notice]);
  useEffect(()=>{if(ready) void globeRef.current?.setSurface(surface);},[ready,surface]);
  useEffect(()=>{if(ready) globeRef.current?.setTerrain(terrain);},[ready,terrain]);
  useEffect(()=>{if(ready) globeRef.current?.setBorders(borders);},[ready,borders]);
  useEffect(()=>{if(ready) globeRef.current?.setLabels(labels);},[ready,labels]);
  useEffect(()=>{if(ready) globeRef.current?.setExaggeration(exaggeration);},[ready,exaggeration]);
  useEffect(()=>{if(ready) globeRef.current?.setShading(shading);},[ready,shading]);
  useEffect(()=>{if(ready) globeRef.current?.setTraffic(trafficTargets);},[ready,trafficTargets]);
  const home=useCallback(()=>{globeRef.current?.home();setLocation('Planet Earth');},[]);
  const goTo=useCallback((lng:number,lat:number,range=14000,heading=0)=>{
    setTerrain(true);globeRef.current?.clearPoint();
    void globeRef.current?.goTo(lng,lat,range,TERRAIN_VIEW_ANGLE,heading);setPanelOpen(false);
  },[]);
  const selectTraffic=useCallback((target:TrafficTarget)=>{setSelectedTraffic(target);setPoint(null);globeRef.current?.selectTraffic(target.id);},[]);
  useEffect(()=>{const handle=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openTools();}if(e.key==='Escape')closeTools();};window.addEventListener('keydown',handle);return()=>window.removeEventListener('keydown',handle);},[openTools,closeTools]);
  const terrainPlace=nearestTerrainPlace(view.latitude,view.longitude);
  const applyAngle=(angle:number,closePanel=false)=>{
    if(angle<78) {
      setTerrain(true);
      if(view.range>GLOBE_VIEW_RANGE&&!point) {
        setLocation(terrainPlace.name);
        void globeRef.current?.goTo(terrainPlace.lng,terrainPlace.lat,terrainPlace.range,angle,terrainPlace.heading);
      } else { void globeRef.current?.setAngle(angle); }
    } else { void globeRef.current?.setAngle(angle);setAngleDraft(null); }
    if(closePanel)setPanelOpen(false);
  };
  const applyHeightScale=(value:number)=>{
    setExaggeration(value);globeRef.current?.setExaggeration(value);
    if(view.range<GLOBE_VIEW_RANGE&&view.pitch>-78) void globeRef.current?.setAngle(Math.max(15,-view.pitch));
  };
  const submitCoordinates=(event:React.FormEvent)=>{
    event.preventDefault();
    const values=coordinates.trim().split(/[\s,;]+/).map(Number);
    if(values.length!==2||values.some(v=>!Number.isFinite(v))||Math.abs(values[0])>90||Math.abs(values[1])>180){
      setCoordinateError('Enter latitude (−90 to 90), then longitude (−180 to 180).');return;
    }
    setCoordinateError('');setLocation('Coordinate view');goTo(values[1],values[0]);
  };
  useEffect(()=>{
    if(!ready)return;
    const onKey=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement;
      if(target.closest('input,textarea,select,button,[role="dialog"],[role="slider"],[contenteditable="true"]')||event.altKey||event.metaKey||event.ctrlKey)return;
      if(event.key==='+'||event.key==='='){event.preventDefault();globeRef.current?.zoom(1);}
      if(event.key==='-'){event.preventDefault();globeRef.current?.zoom(-1);}
      if(event.key.toLowerCase()==='h'){event.preventDefault();home();}
      if(event.key.toLowerCase()==='n'){event.preventDefault();globeRef.current?.north();}
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[ready,home]);
  useEffect(()=>{
    if(!ready)return;
    type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean};execute:(input:unknown)=>unknown};
    const context=(document as Document & {modelContext?:{registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    try {
      void Promise.resolve(context.registerTool({name:'start_globe_navigation',description:'Start a camera flight to latitude and longitude using the same controls as the coordinate form.',
        inputSchema:{type:'object',properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180}},required:['latitude','longitude'],additionalProperties:false},
        annotations:{readOnlyHint:false},
        async execute(input:unknown){
          const p=input as {latitude?:unknown;longitude?:unknown};
          if(!p||typeof p.latitude!=='number'||typeof p.longitude!=='number'||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude)||Math.abs(p.latitude)>90||Math.abs(p.longitude)>180)throw new Error('Valid latitude and longitude are required.');
          if(!globeRef.current)throw new Error('Globe is unavailable.');
          setLocation('Coordinate view');goTo(p.longitude,p.latitude);
          return {navigationStarted:true,latitude:p.latitude,longitude:p.longitude};
        }},{signal:lifecycle.signal})).catch(()=>{});
    } catch { /* Browsers without WebMCP still support all visible controls. */ }
    return()=>lifecycle.abort();
  },[ready,goTo]);
  const isOverhead=view.pitch < -78;
  const status=navigating?'Positioning terrain…':!terrain?'Terrain off':!terrainReady?'Loading elevation':loading?'Refining detail':'Terrain loaded';
  return <TooltipProvider delayDuration={180}><main className="earth-app">
    <div ref={canvasRef} className="globe-canvas" aria-label="Interactive Earth: drag to orbit, scroll to zoom, right-drag to tilt; click terrain for elevation" />
    <div className="edge-shade" aria-hidden="true" />
    <header className="app-header">
      <div className="brand"><span className="brand-mark"><Globe2 size={26} strokeWidth={1.4}/></span><div><h1>Atlas<span className="brand-period">-Netic</span></h1><p>EARTH EXPLORER</p></div></div>
      <div className="header-actions"><button className="quiet-button" onClick={openTools} aria-label="Open 100 tools"><Settings2 size={17}/><span>Tools</span></button>
        <span className="scale-pill"><Mountain size={15}/><span>{terrain?`${exaggeration.toFixed(1)}× terrain`:'Terrain off'}</span></span>
        <Dialog><DialogTrigger asChild><button className="quiet-button info-button" aria-label="Data & controls"><Info size={18}/><span>Data & controls</span></button></DialogTrigger>
          <DialogContent className="information-dialog"><DialogHeader><DialogTitle>Earth, at its real scale.</DialogTitle><DialogDescription>Elevation sources, precision, and ways to move.</DialogDescription></DialogHeader>
            <div className="information-scroll">
              <h3>Move around</h3><div className="instruction-grid"><span>Orbit / pan</span><strong>Drag with one finger or left mouse</strong><span>Zoom</span><strong>Pinch, scroll, or + / −</strong><span>Tilt / rotate</span><strong>Two fingers, right-drag, or Ctrl + drag</strong><span>Inspect elevation</span><strong>Click or tap the surface</strong><span>Return to Earth / north</span><strong>H / N, or the on-screen controls</strong></div>
              <h3>See the relief</h3><p>Terrain 3D moves to a close side view aimed at the measured ground height. At globe scale it opens the mountain or canyon named beside the control; tap the globe first to focus a specific point. Use the viewing-angle slider to look across slopes. Height scale starts at 1×, with optional 2×–6× exaggeration for subtle terrain.</p><h3>Terrain & elevation</h3><p>The globe uses Esri World Elevation Terrain 3D, a mosaic of measured elevation datasets. Detail varies by location and zoom; the source mosaic ranges from 0.5 m to 1,000 m spacing. Those spacings describe source resolution, not guaranteed vertical accuracy or the resolution of every streamed tile.</p>
              <p>Elevation inspection requests the finest available terrain tile at the selected point. Values are approximate, rounded to meters, and use the source’s orthometric height reference (relative to a sea-level model). They remain unchanged when you exaggerate the display.</p>
              <p>1× preserves the source’s real height scale. Higher settings stretch the display for readability. Geographic coverage of the streamed terrain is approximately 85° S to 85° N; polar caps use a smooth globe. Camera altitude is measured relative to the globe’s ellipsoid.</p>
              <a href="https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" target="_blank" rel="noreferrer">Terrain source & details <ArrowUpRight size={14}/></a>
              <a href="https://esriurl.com/elevationcoveragemap" target="_blank" rel="noreferrer">Regional elevation coverage <ArrowUpRight size={14}/></a>
              <h3>Imagery & borders</h3><p>Satellite imagery: Esri World Imagery, with optional Esri World Hillshade to bring out slope detail. Relief: Esri World Shaded Relief. Imagery is a collection from different dates, not a live feed. Image sharpness and elevation detail are independent.</p>
              <p>Country boundaries use Natural Earth’s 1:10 million land-boundary dataset. Dashed amber lines mark disputed or indefinite boundaries and lines of control. Borders are generalized, reflect the source’s de facto policy, and are not legal boundary surveys.</p>
              <a href="https://www.naturalearthdata.com/about/disputed-boundaries-policy/" target="_blank" rel="noreferrer">Natural Earth boundary policy <ArrowUpRight size={14}/></a>
              <h3>Traffic & coverage</h3><p>Air traffic uses public ADS-B and multilateration reports from ADSB.lol within 250 nautical miles of your view center. The military switch filters aircraft marked military by that source. Classification can be incomplete; aircraft without received broadcasts do not appear.</p>
              <p>Aircraft positions refresh every 15 seconds and expire after 90 seconds. Altitudes are reported geometric heights where available, otherwise barometric estimates; they are independent of terrain height exaggeration. All loaded aircraft and boats use persistent generic 3D models with reported direction. Models enlarge with distance for legibility; their dimensions and attitude are not measured. No motion is extrapolated. Unknown altitude uses a gray model on the surface, not a claimed ground position. Unknown direction uses a neutral north orientation. Barometric altitude is not corrected for local pressure or the geoid. Tap a model for its latest reported position, speed, and timestamp.</p>
              <p>The included maritime source is Fintraffic’s AIS reception from Finnish waterways and nearby Baltic waters. It refreshes every minute and hides reports older than 15 minutes. When a worldwide AIS provider is connected, the app shows that provider and its partial receiver coverage. Missing markers never mean that an area is empty.</p>
              <a href="https://www.adsb.lol/docs/open-data/api/" target="_blank" rel="noreferrer">ADSB.lol · Open Database License <ArrowUpRight size={14}/></a>
              <a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noreferrer">Fintraffic / Digitraffic · CC BY 4.0 <ArrowUpRight size={14}/></a>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
    <button className="mobile-controls quiet-button" aria-expanded={panelOpen} aria-controls="explore-panel" onClick={()=>setPanelOpen(!panelOpen)}><Settings2 size={17}/> View & layers <ChevronDown size={15} className={panelOpen?'rotated':''}/></button>
    <aside id="explore-panel" className={`explore-panel glass ${panelOpen?'open':''}`}>
      <div className="panel-heading"><span className="section-label">YOUR PERSPECTIVE</span><Compass size={17}/></div>
      <div className="view-heading"><h2>{isOverhead?'A view from above.':'Closer to the surface.'}</h2></div>
      <div className="view-choices" role="group" aria-label="Camera perspective"><button className={isOverhead?'selected':''} disabled={!ready} onClick={()=>applyAngle(90)}><ArrowDownToLine size={16}/>Overhead</button><button className={!isOverhead?'selected':''} disabled={!ready||navigating} onClick={()=>applyAngle(TERRAIN_VIEW_ANGLE,true)}><Mountain size={16}/>Terrain 3D</button></div>
      <p className="terrain-view-hint">{view.range>GLOBE_VIEW_RANGE&&!point?`From globe: opens ${terrainPlace.name}.`:point?'Focuses the point you selected.':'Moves closer to the center of your view.'}</p>
      <div className="angle-control"><div><label htmlFor="view-angle">Viewing angle</label><span>{Math.round(angleDraft??Math.min(90,Math.max(15,-view.pitch)))}°</span></div><Slider id="view-angle" aria-label="Viewing angle below the horizon" min={15} max={90} step={1} disabled={!ready||navigating} value={[angleDraft??Math.min(90,Math.max(15,-view.pitch))]} onValueChange={([value])=>setAngleDraft(value)} onValueCommit={([value])=>applyAngle(value)}/><div className="slider-labels"><span>Side</span><span>Overhead</span></div></div>
      <div className="panel-section"><span className="section-label">SURFACE</span><RadioGroup className="surface-choices" aria-label="Surface imagery" value={surface} onValueChange={value=>setSurface(value as Surface)}><label htmlFor="surface-satellite" className={`surface-option ${surface==='satellite'?'selected':''}`}><RadioGroupItem id="surface-satellite" value="satellite" className="sr-only"/><Satellite size={21}/><span>Satellite</span></label><label htmlFor="surface-relief" className={`surface-option ${surface==='relief'?'selected':''}`}><RadioGroupItem id="surface-relief" value="relief" className="sr-only"/><Mountain size={21}/><span>Relief</span></label></RadioGroup></div>
      <div className="panel-section layers-section"><span className="section-label">MAP LAYERS</span><label className="layer-row" htmlFor="terrain-toggle"><span><Mountain size={17}/>3D terrain</span><Switch id="terrain-toggle" checked={terrain} onCheckedChange={setTerrain}/></label><label className="layer-row" htmlFor="shading-toggle"><span><Mountain size={17}/>Terrain shading</span><Switch id="shading-toggle" checked={shading} onCheckedChange={setShading}/></label><label className="layer-row" htmlFor="border-toggle"><span><Layers3 size={17}/>Country borders</span><Switch id="border-toggle" checked={borders} onCheckedChange={setBorders}/></label><label className="layer-row" htmlFor="label-toggle"><span><LocateFixed size={17}/>Country names</span><Switch id="label-toggle" checked={labels} onCheckedChange={setLabels}/></label>
        <div className="exaggeration-label"><label htmlFor="height-scale">Height scale</label><button disabled={exaggeration===1} onClick={()=>applyHeightScale(1)}>{exaggeration===1?'1× · real scale':`${exaggeration.toFixed(1)}× · reset`}</button></div><Slider id="height-scale" aria-label="Terrain height exaggeration" min={1} max={6} step={0.25} value={[exaggeration]} disabled={!terrain} onValueChange={([v])=>setExaggeration(v)} onValueCommit={([v])=>applyHeightScale(v)}/><div className="slider-labels"><span>1× real</span><span>6× exaggerated</span></div><div className="height-presets" role="group" aria-label="Height scale presets">{[1,2,4].map(scale=><button key={scale} disabled={!terrain||navigating} aria-pressed={exaggeration===scale} onClick={()=>applyHeightScale(scale)}>{scale}×{scale===1?' Real':''}</button>)}</div>
      </div>
      <button className="traffic-link" onClick={openTools}>Open traffic list & 100 tools ↗</button><AltitudeUnits/><TrafficPanel layers={trafficLayers} onChange={setTrafficLayers} feeds={trafficFeeds} onBaltic={()=>{globeRef.current?.overview(24.8,59.7);setLocation('Gulf of Finland');setPanelOpen(false);}}/>
      <div className="panel-section terrain-destinations"><span className="section-label">EXPLORE THE TERRAIN</span><div className="destination-grid">{TERRAIN_PLACES.map(place=><button key={place.name} disabled={!ready} onClick={()=>{setLocation(place.name);goTo(place.lng,place.lat,place.range,place.heading);}} title={place.detail}><span>{place.name}</span><ArrowUpRight size={14}/></button>)}</div></div>
      <form className="coordinate-form" onSubmit={submitCoordinates}><label className="sr-only" htmlFor="coordinates">Latitude, longitude</label><div><Crosshair size={16}/><input id="coordinates" placeholder="Latitude, longitude" value={coordinates} onChange={event=>{setCoordinates(event.target.value);setCoordinateError('');}} aria-invalid={!!coordinateError} aria-describedby={coordinateError?'coordinate-error':undefined}/><button type="submit" disabled={!ready} aria-label="Go to coordinates"><ArrowUpRight size={17}/></button></div>{coordinateError&&<p id="coordinate-error">{coordinateError}</p>}</form>
    </aside>
    <div className="scene-reticle" aria-hidden="true"><span/><span/></div>
    <nav className="navigation-tools" aria-label="Globe navigation">
      <Tooltip><TooltipTrigger asChild><button className="compass-button glass" onClick={()=>globeRef.current?.north()} disabled={!ready} aria-label="Face north"><span>N</span><Navigation2 size={23} fill="currentColor" style={{transform:`rotate(${-view.heading}deg)`}}/></button></TooltipTrigger><TooltipContent side="left">Face north · N</TooltipContent></Tooltip>
      <div className="tool-group glass"><ToolButton label="Zoom in · +" disabled={!ready} onClick={()=>globeRef.current?.zoom(1)}><Plus/></ToolButton><ToolButton label="Zoom out · −" disabled={!ready} onClick={()=>globeRef.current?.zoom(-1)}><Minus/></ToolButton></div>
      <div className="tool-group glass"><ToolButton label="Overhead view" active={isOverhead} disabled={!ready} onClick={()=>applyAngle(90)}><ArrowDownToLine size={20}/></ToolButton><ToolButton label="Terrain 3D · close side view" active={!isOverhead} disabled={!ready||navigating} onClick={()=>applyAngle(TERRAIN_VIEW_ANGLE,true)}><Mountain size={20}/></ToolButton></div>
      <div className="tool-group glass"><ToolButton label="Return to globe · H" disabled={!ready} onClick={home}><Globe2 size={20}/></ToolButton></div>
    </nav>
    {(!ready||fatal)&&<div className="globe-loading" role="status"><div className="loading-emblem"><Globe2 size={36}/></div><h2>{fatal?'The globe couldn’t start':'Opening Earth'}</h2><p>{fatal||'Loading your view of the planet…'}</p>{fatal&&<button className="primary-button" onClick={reloadGlobe}><RotateCcw size={16}/>Try again</button>}</div>}
    {Object.keys(notices).length>0&&<div className="notice glass" role="status"><Info size={17}/><div>{Object.entries(notices).map(([key,message])=><p key={key}>{message}</p>)}<button onClick={reloadGlobe}>Recover view</button></div></div>}
    {point&&<section className="elevation-card glass" aria-label="Selected terrain elevation"><div className="elevation-title"><span><Crosshair size={15}/>SURFACE ELEVATION</span><button aria-label="Close elevation" onClick={()=>globeRef.current?.clearPoint()}><X size={17}/></button></div><p className="elevation-value" aria-live="polite">{point.pending?'Sampling…':point.height===null?'Unavailable':<><span className="approximately">≈</span>{formatAltitude(point.height,unit)}</>}</p><p className="elevation-coordinates">{coordinate(point.latitude,'N','S')}<span> / </span>{coordinate(point.longitude,'E','W')}</p><button className="point-terrain-button" disabled={!ready||navigating} onClick={()=>applyAngle(TERRAIN_VIEW_ANGLE,true)}><Mountain size={16}/>View this point in 3D</button><p className="elevation-note">{point.height===null&&!point.pending?'No elevation sample is available here.':'Source elevation · unaffected by height scale'}</p></section>}
    {selectedTraffic&&<section className="elevation-card traffic-card glass" aria-label="Selected transponder report"><div className="elevation-title"><span>{selectedTraffic.kind==='maritime'?'AIS VESSEL':selectedTraffic.kind==='military'?'MILITARY AIRCRAFT':'AIRCRAFT'}</span><button aria-label="Close traffic details" onClick={()=>{setSelectedTraffic(null);globeRef.current?.clearTrafficSelection();}}><X size={17}/></button></div><h2>{selectedTraffic.name}</h2><dl><dt>ID / type</dt><dd>{selectedTraffic.id}<small>{selectedTraffic.registration} {selectedTraffic.aircraftType}</small></dd><dt>Position</dt><dd>{coordinate(selectedTraffic.latitude,'N','S')}<br/>{coordinate(selectedTraffic.longitude,'E','W')}</dd><dt>Speed</dt><dd>{selectedTraffic.speed===null?'Not reported':`${Math.round(selectedTraffic.speed)} kn`}</dd>{selectedTraffic.kind!=='maritime'&&<><dt>Altitude</dt><dd>{formatAltitude(selectedTraffic.altitude,unit)}<small>{selectedTraffic.altitudeReference}</small></dd></>}<dt>Direction</dt><dd>{selectedTraffic.heading===null?'Not reported':`${selectedTraffic.heading.toFixed(1)}°`}<small>{selectedTraffic.headingReference||'course over ground'}</small></dd><dt>Reported</dt><dd>{new Date(selectedTraffic.observedAt).toLocaleTimeString()}<small>{selectedTraffic.source}</small></dd></dl><p className="elevation-note">Last reported position · generic model, enlarged for visibility. {selectedTraffic.altitude===null?'Altitude unknown; model shows horizontal position only.':selectedTraffic.altitudeReference==='barometric'?'Barometric height is an uncorrected estimate.':''}</p></section>}
    <div className="bottom-guide"><span className="location-name">{location}</span>{navigating&&<span className="navigation-progress" role="status">Loading terrain and adjusting your view…</span>}<p><span className="desktop-gesture">Drag to orbit<span>·</span>Scroll to zoom<span>·</span>Right-drag to tilt</span><span className="touch-gesture">Drag to orbit · Pinch to zoom · Two fingers to tilt</span></p></div>
    <footer className="telemetry"><div className="terrain-status"><span className={terrainReady&&terrain?'status-light':'status-light inactive'}/><span>{status}</span></div><div className="position-data"><span>{coordinate(view.latitude,'N','S')}</span><span>{coordinate(view.longitude,'E','W')}</span><span className="altitude"><small>CAM ALT</small>{formatAltitude(view.altitude,unit)}</span></div><span className="click-hint"><Crosshair size={13}/>Click terrain for elevation</span></footer>
    {toolsLoaded&&<ToolsDrawer open={toolsOpen} onClose={closeTools} getGlobe={getGlobe} ready={ready} view={view} point={point} feeds={trafficFeeds} selected={selectedTraffic} onSelect={selectTraffic} paused={trafficPaused} onPaused={setTrafficPaused}/>}
    <div ref={creditRef} className="map-credits" />
  </main></TooltipProvider>;
}
