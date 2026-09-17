"use client";
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Compass, Database, Globe2, Home, Layers3, Minus, Plus, Settings2, Share2, X } from 'lucide-react';
import { Globe, loadCesium, type Surface, type TerrainPoint, type ViewInfo } from '@/lib/globe';
import { useTraffic } from '@/hooks/use-traffic';
import type { TrafficLayers, TrafficTarget } from '@/lib/traffic';
import { TrafficPanel } from '@/components/traffic-panel';
import { Switch } from '@/components/ui/switch';
import { AltitudeUnits } from '@/components/altitude-units';
import { useAltitude } from '@/hooks/use-altitude';
import { formatAltitude } from '@/lib/altitude';
import { DEFAULT_INTELLIGENCE_LAYERS, type IntelligenceKind, type IntelligenceLayers, type IntelligenceSignal } from '@/lib/intelligence/types';
import { useIntelligence } from '@/hooks/use-intelligence';
import { IntelligenceRenderer } from '@/lib/intelligence/renderer';
import { IntelligencePanel } from '@/components/intelligence-panel';
import { encodeScene, readSceneHash } from '@/lib/intelligence/scene';
import styles from './atlas-v2.module.css';

const ToolsDrawer = dynamic(() => import('@/components/tools-drawer'), { ssr: false });
type PanelTab = 'map' | 'traffic' | 'intel';

function useDiagnostics(objects: number) {
  const [value, setValue] = useState({ fps: 0, objects, heapMb: null as number | null });
  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0, active = true;
    const frame = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        const memory = performance as Performance & { memory?: { usedJSHeapSize: number } };
        setValue({ fps: Math.round(frames * 1000 / (now - last)), objects, heapMb: memory.memory ? memory.memory.usedJSHeapSize / 1024 / 1024 : null });
        frames = 0; last = now;
      }
      if (active) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { active = false; cancelAnimationFrame(raf); };
  }, [objects]);
  return value;
}

export default function AtlasV2() {
  const { unit } = useAltitude();
  const canvasRef = useRef<HTMLDivElement>(null), creditRef = useRef<HTMLDivElement>(null), globeRef = useRef<Globe | null>(null), intelligenceRenderer = useRef<IntelligenceRenderer | null>(null);
  const [ready, setReady] = useState(false), [fatal, setFatal] = useState(''), [retry, setRetry] = useState(0), [terrainReady, setTerrainReady] = useState(false), [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewInfo>({ latitude: 24, longitude: -90, altitude: 18_000_000, heading: 0, pitch: -90, range: 18_000_000 });
  const [point, setPoint] = useState<TerrainPoint | null>(null), [notices, setNotices] = useState<Record<string,string>>({});
  const [surface, setSurface] = useState<Surface>('satellite'), [terrain, setTerrain] = useState(true), [borders, setBorders] = useState(true), [labels, setLabels] = useState(true), [exaggeration, setExaggeration] = useState(1), [shading, setShading] = useState(true);
  const [trafficLayers, setTrafficLayers] = useState<TrafficLayers>({ air: false, military: false, maritime: false }), [selectedTraffic, setSelectedTraffic] = useState<TrafficTarget | null>(null), [trafficPaused, setTrafficPaused] = useState(false);
  const [intelLayers, setIntelLayers] = useState<IntelligenceLayers>(DEFAULT_INTELLIGENCE_LAYERS), [selectedSignal, setSelectedSignal] = useState<IntelligenceSignal | null>(null), [satelliteGroup, setSatelliteGroup] = useState('STATIONS'), [replayMinutes, setReplayMinutes] = useState(0), [replayAt, setReplayAt] = useState<number|null>(null);
  const [panelOpen, setPanelOpen] = useState(true), [panelTab, setPanelTab] = useState<PanelTab>('intel'), [toolsOpen, setToolsOpen] = useState(false), [shareMessage, setShareMessage] = useState('');
  const sceneApplied = useRef(false);
  const getGlobe = useCallback(() => globeRef.current, []);
  const notice = useCallback((key: string, message: string | null) => setNotices(previous => { const next = { ...previous }; if (message) next[key] = message; else delete next[key]; return next; }), []);
  const trafficFeeds = useTraffic(trafficLayers, ready, view.latitude, view.longitude, trafficPaused);
  const airTargets=trafficFeeds.air.targets,maritimeTargets=trafficFeeds.maritime.targets,trafficAt=trafficFeeds.at;
  const trafficTargets = useMemo(() => (replayAt === null ? [...airTargets, ...maritimeTargets] : trafficAt(replayAt)).filter(target => trafficLayers[target.kind]), [airTargets, maritimeTargets, trafficAt, replayAt, trafficLayers]);
  const intelligence = useIntelligence(intelLayers, ready, view.latitude, view.longitude, satelliteGroup, replayAt);
  const diagnostics = useDiagnostics(intelligence.allSignals.length + trafficTargets.length);
  const setReplay=useCallback((minutes:number)=>{setReplayMinutes(minutes);setReplayAt(minutes>0?Date.now()-minutes*60_000:null);},[]);

  useEffect(() => {
    let cancelled = false, engine: Globe | undefined, renderer: IntelligenceRenderer | undefined;
    void (async () => {
      try {
        const C = await loadCesium();
        if (cancelled || !canvasRef.current || !creditRef.current) return;
        engine = new Globe(C, canvasRef.current, creditRef.current, { onView: setView, onPoint: setPoint, onTerrain: setTerrainReady, onNavigating: () => {}, onLoading: setLoading, onNotice: notice, onTraffic: target => { setSelectedTraffic(target); if (target) setSelectedSignal(null); } });
        globeRef.current = engine;
        renderer = new IntelligenceRenderer(C, engine.viewer, signal => { setSelectedSignal(signal); if (signal) { setSelectedTraffic(null); engine?.clearTrafficSelection(); } });
        intelligenceRenderer.current = renderer;
        if (retry > 0) engine.setQuality('eco');
        setReady(true);
        await engine.initialize();
      } catch (error) { if (!cancelled) setFatal(error instanceof Error ? error.message : 'Your browser could not start Atlas-Netic.'); }
    })();
    return () => { cancelled = true; setReady(false); intelligenceRenderer.current = null; renderer?.destroy(); globeRef.current = null; engine?.destroy(); };
  }, [retry, notice]);

  useEffect(() => { if (ready) void globeRef.current?.setSurface(surface); }, [ready, surface]);
  useEffect(() => { if (ready) globeRef.current?.setTerrain(terrain); }, [ready, terrain]);
  useEffect(() => { if (ready) globeRef.current?.setBorders(borders); }, [ready, borders]);
  useEffect(() => { if (ready) globeRef.current?.setLabels(labels); }, [ready, labels]);
  useEffect(() => { if (ready) globeRef.current?.setExaggeration(exaggeration); }, [ready, exaggeration]);
  useEffect(() => { if (ready) globeRef.current?.setShading(shading); }, [ready, shading]);
  useEffect(() => { if (ready) globeRef.current?.setTraffic(trafficTargets); }, [ready, trafficTargets]);
  useEffect(() => { if (ready) intelligenceRenderer.current?.sync(intelligence.allSignals); }, [ready, intelligence.allSignals]);

  useEffect(() => {
    if (!ready || sceneApplied.current) return;
    sceneApplied.current = true;
    const scene = readSceneHash();
    if (!scene) return;
    queueMicrotask(()=>{
      setSurface(scene.surface); setTerrain(scene.terrain); setBorders(scene.borders); setLabels(scene.labels); setExaggeration(scene.exaggeration);
      setTrafficLayers(scene.traffic); setIntelLayers(scene.intelligence); setSatelliteGroup(scene.satelliteGroup); setReplay(scene.replayMinutes || 0);
      globeRef.current?.restoreCamera(scene.camera);
    });
  }, [ready,setReplay]);

  useEffect(() => {
    if (!shareMessage) return;
    const timer = setTimeout(() => setShareMessage(''), 2200);
    return () => clearTimeout(timer);
  }, [shareMessage]);

  const share = async () => {
    const camera = globeRef.current?.cameraSnapshot();
    if (!camera) return;
    const encoded = encodeScene({ version: 2, camera, surface, terrain, borders, labels, exaggeration, traffic: trafficLayers, intelligence: intelLayers, satelliteGroup, replayMinutes });
    const url = `${location.origin}${location.pathname}#scene=${encoded}`;
    try { await navigator.clipboard.writeText(url); setShareMessage('Scene link copied'); }
    catch { history.replaceState(null, '', `#scene=${encoded}`); setShareMessage('Scene encoded in this URL'); }
  };

  const feedMap: Record<IntelligenceKind, typeof intelligence.earthquakes> = { earthquakes: intelligence.earthquakes, fires: intelligence.fires, weather: intelligence.weather, satellites: intelligence.satellites };
  const trafficHealth = { air: { phase: trafficFeeds.air.phase, message: trafficFeeds.air.message, updatedAt: trafficFeeds.air.updatedAt, count: trafficFeeds.air.targets.length, cache: trafficFeeds.air.cache }, maritime: { phase: trafficFeeds.maritime.phase, message: trafficFeeds.maritime.message, updatedAt: trafficFeeds.maritime.updatedAt, count: trafficFeeds.maritime.targets.length, cache: trafficFeeds.maritime.cache } };
  const status = fatal ? 'Globe unavailable' : !ready ? 'Starting globe…' : !terrain ? 'Terrain off' : !terrainReady ? 'Loading elevation…' : loading ? 'Refining map detail…' : replayMinutes ? `Replay · ${replayMinutes}m ago` : 'Live Earth';

  if (fatal) return <main className={styles.error}><div><Globe2 size={38}/><h1>Atlas-Netic could not start</h1><p>{fatal}</p><button onClick={() => { setFatal(''); setRetry(value => value + 1); }}>Recover with lighter graphics</button></div></main>;
  return <main className={`earth-app ${styles.app}`}>
    <div ref={canvasRef} className={`globe-canvas ${styles.canvas}`} aria-label="Interactive Atlas-Netic 3D Earth"/>
    {loading && <div className={styles.loadingCover}/>}<div ref={creditRef} className={styles.credit}/>
    <header className={styles.header}>
      <div className={styles.brand}><span className={styles.brandMark}><Globe2 size={23}/></span><div><h1>Atlas-Netic</h1><p>EARTH INTELLIGENCE</p></div></div>
      <div className={styles.headerActions}><button onClick={() => { setPanelOpen(true); setPanelTab('intel'); }}><span className={styles.liveDot}/><Database size={17}/><span>Intelligence</span></button><button onClick={() => void share()}><Share2 size={17}/><span>Share</span></button><button onClick={() => setToolsOpen(true)}><Settings2 size={17}/><span>Tools</span></button></div>
    </header>
    <nav className={styles.rail} aria-label="Globe controls"><button aria-label="Home" onClick={() => globeRef.current?.home()}><Home size={18}/></button><button aria-label="Zoom in" onClick={() => globeRef.current?.zoom(1)}><Plus size={18}/></button><button aria-label="Zoom out" onClick={() => globeRef.current?.zoom(-1)}><Minus size={18}/></button><button aria-label="Face north" onClick={() => globeRef.current?.north()}><Compass size={18}/></button><button aria-label="Layers" onClick={() => { setPanelOpen(value => !value); setPanelTab('map'); }}><Layers3 size={18}/></button></nav>
    {panelOpen && <aside className={styles.panel} aria-label="Atlas controls"><div className={styles.tabBar}><button data-active={panelTab==='map'} onClick={() => setPanelTab('map')}><Layers3 size={14}/>Map</button><button data-active={panelTab==='traffic'} onClick={() => setPanelTab('traffic')}><Activity size={14}/>Traffic</button><button data-active={panelTab==='intel'} onClick={() => setPanelTab('intel')}><Database size={14}/>Intel</button></div><div className={styles.panelBody}>
      {panelTab === 'map' && <div className={styles.mapSection}><h3>MAP & DISPLAY</h3><div className={styles.controlRow}><label>Surface</label><select value={surface} onChange={event => setSurface(event.target.value as Surface)}><option value="satellite">Satellite</option><option value="relief">Relief</option></select></div><div className={styles.controlRow}><label>3D terrain</label><Switch checked={terrain} onCheckedChange={setTerrain}/></div><div className={styles.controlRow}><label>Terrain shading</label><Switch checked={shading} onCheckedChange={setShading}/></div><div className={styles.controlRow}><label>Country borders</label><Switch checked={borders} onCheckedChange={setBorders}/></div><div className={styles.controlRow}><label>Country labels</label><Switch checked={labels} onCheckedChange={setLabels}/></div><div className={styles.sliderBlock}><div className={styles.rowBetween}><span>Height scale</span><strong>{exaggeration.toFixed(1)}×</strong></div><input type="range" min="1" max="6" step="0.5" value={exaggeration} onChange={event => setExaggeration(Number(event.target.value))}/></div><div className={styles.controlRow}><label>Altitude units</label><AltitudeUnits/></div></div>}
      {panelTab === 'traffic' && <div className={styles.trafficWrap}><TrafficPanel layers={trafficLayers} onChange={setTrafficLayers} feeds={trafficFeeds} onBaltic={() => globeRef.current?.overview(24.8, 59.7, 1_100_000)}/></div>}
      {panelTab === 'intel' && <IntelligencePanel layers={intelLayers} onChange={setIntelLayers} feeds={feedMap} satelliteGroup={satelliteGroup} onSatelliteGroup={setSatelliteGroup} replayMinutes={replayMinutes} onReplay={setReplay} diagnostics={diagnostics} trafficHealth={trafficHealth}/>} 
    </div></aside>}
    <div className={styles.status}><span className={replayMinutes ? undefined : styles.liveDot}/><span>{status}</span><span>·</span><span>{view.latitude.toFixed(2)}°, {view.longitude.toFixed(2)}°</span><span>·</span><span>{formatAltitude(view.altitude, unit)}</span>{Object.values(notices).length>0 && <><span>·</span><span>{Object.values(notices)[0]}</span></>}</div>
    {selectedSignal && <aside className={styles.selectionCard}><header><div><h3>{selectedSignal.name}</h3><p>{selectedSignal.kind} · {selectedSignal.source} · {selectedSignal.quality}</p></div><button aria-label="Close intelligence detail" onClick={() => { setSelectedSignal(null); intelligenceRenderer.current?.clearSelection(); }}><X size={18}/></button></header><dl className={styles.selectionGrid}><div><dt>Position</dt><dd>{selectedSignal.latitude.toFixed(4)}, {selectedSignal.longitude.toFixed(4)}</dd></div><div><dt>Altitude</dt><dd>{selectedSignal.altitude === null ? 'Not reported' : formatAltitude(selectedSignal.altitude, unit)}</dd></div><div><dt>Observed</dt><dd>{new Date(selectedSignal.observedAt).toLocaleString()}</dd></div><div><dt>Severity</dt><dd>{selectedSignal.severity}</dd></div>{Object.entries(selectedSignal.details).filter(([,value]) => value !== null && value !== '' && !String(value).startsWith('1 ') && !String(value).startsWith('2 ')).slice(0,8).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl>{selectedSignal.sourceUrl && <a className={styles.sourceLink} href={selectedSignal.sourceUrl} target="_blank" rel="noreferrer">Open source record ↗</a>}</aside>}
    {!selectedSignal && selectedTraffic && <aside className={styles.selectionCard}><header><div><h3>{selectedTraffic.name}</h3><p>{selectedTraffic.kind} · {selectedTraffic.source}</p></div><button aria-label="Close traffic detail" onClick={() => { setSelectedTraffic(null); globeRef.current?.clearTrafficSelection(); }}><X size={18}/></button></header><dl className={styles.selectionGrid}><div><dt>Position</dt><dd>{selectedTraffic.latitude.toFixed(4)}, {selectedTraffic.longitude.toFixed(4)}</dd></div><div><dt>Altitude</dt><dd>{selectedTraffic.altitude === null ? 'Unknown' : formatAltitude(selectedTraffic.altitude, unit)}</dd></div><div><dt>Speed</dt><dd>{selectedTraffic.speed === null ? 'Unknown' : `${selectedTraffic.speed.toFixed(0)} kt`}</dd></div><div><dt>Heading</dt><dd>{selectedTraffic.heading === null ? 'Unknown' : `${selectedTraffic.heading.toFixed(0)}°`}</dd></div><div><dt>Stored observations</dt><dd>{trafficFeeds.historyFor(selectedTraffic.id).length}</dd></div></dl></aside>}
    {shareMessage && <div className={styles.shareMessage}>{shareMessage}</div>}
    <ToolsDrawer open={toolsOpen} onClose={() => setToolsOpen(false)} getGlobe={getGlobe} ready={ready} view={view} point={point} feeds={trafficFeeds} selected={selectedTraffic} onSelect={target => { setSelectedSignal(null); setSelectedTraffic(target); globeRef.current?.selectTraffic(target.id); }} paused={trafficPaused} onPaused={setTrafficPaused}/>
  </main>;
}
