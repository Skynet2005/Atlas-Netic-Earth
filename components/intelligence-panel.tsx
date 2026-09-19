"use client";
import { Activity, Flame, Satellite, CloudLightning, RefreshCw, Clock3, Plane, Ship } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { IntelligenceFeed } from '@/hooks/use-intelligence';
import type { IntelligenceLayers, IntelligenceKind } from '@/lib/intelligence/types';
import styles from './atlas-v2.module.css';

const rows: { kind: IntelligenceKind; title: string; Icon: typeof Activity }[] = [
  { kind: 'earthquakes', title: 'Earthquakes', Icon: Activity },
  { kind: 'fires', title: 'Active fires', Icon: Flame },
  { kind: 'weather', title: 'Weather alerts', Icon: CloudLightning },
  { kind: 'satellites', title: 'Satellites', Icon: Satellite },
];

type TrafficHealth = { phase: string; message: string; updatedAt: number | null; count: number; cache: string | null };

function age(updatedAt: number | null) {
  if (!updatedAt) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  return seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.round(seconds / 60)}m ago` : `${Math.round(seconds / 3600)}h ago`;
}

export function IntelligencePanel({ layers, onChange, feeds, satelliteGroup, onSatelliteGroup, replayMinutes, onReplay, diagnostics, trafficHealth }: {
  layers: IntelligenceLayers;
  onChange: (layers: IntelligenceLayers) => void;
  feeds: Record<IntelligenceKind, IntelligenceFeed>;
  satelliteGroup: string;
  onSatelliteGroup: (group: string) => void;
  replayMinutes: number;
  onReplay: (minutes: number) => void;
  diagnostics: { fps: number; objects: number; heapMb: number | null };
  trafficHealth: { air: TrafficHealth; maritime: TrafficHealth };
}) {
  return <div className={styles.intelPanel}>
    <div className={styles.timelineBlock}>
      <div className={styles.rowBetween}><span><Clock3 size={15}/> Timeline</span><strong>{replayMinutes ? `${replayMinutes}m ago` : 'LIVE'}</strong></div>
      <input aria-label="Replay timeline" type="range" min="0" max="1440" step="15" value={replayMinutes} onChange={event => onReplay(Number(event.target.value))}/>
      <div className={styles.timelineLabels}><span>LIVE</span><span>6h</span><span>12h</span><span>24h</span></div>
      {replayMinutes > 360 && <p>Event and satellite layers can replay up to 24 hours. Traffic replay only includes reports Atlas actually collected during this browser session.</p>}
    </div>
    {rows.map(({ kind, title, Icon }) => {
      const feed = feeds[kind], health = feed.health;
      return <section key={kind} className={styles.intelRow}>
        <label><span><Icon size={17}/>{title}</span><Switch checked={layers[kind]} onCheckedChange={value => onChange({ ...layers, [kind]: value })}/></label>
        {layers[kind] && <>
          {kind === 'satellites' && <select aria-label="Satellite catalog" value={satelliteGroup} onChange={event => onSatelliteGroup(event.target.value)}>
            <option value="STATIONS">Stations / crewed</option><option value="GPS-OPS">GPS operational</option><option value="WEATHER">Weather</option><option value="SCIENCE">Science</option><option value="GEO">Geostationary</option><option value="STARLINK">Starlink</option>
          </select>}
          <div className={styles.healthLine}><span className={`${styles.phase} ${styles[health.phase]}`}>{health.phase.replace('_',' ')}</span><span>{health.count.toLocaleString()} objects</span><span>{age(health.updatedAt)}</span><button aria-label={`Refresh ${title}`} onClick={feed.refresh}><RefreshCw size={13}/></button></div>
          <p>{health.message}</p><small>{health.source}{health.coverage ? ` · ${health.coverage}` : ''}{health.latencyMs !== null ? ` · ${health.latencyMs} ms` : ''}{health.cache ? ` · cache ${health.cache}` : ''}</small>
        </>}
      </section>;
    })}
    <section className={styles.diagnostics}><div className={styles.rowBetween}><span>Transponder source health</span><strong>PUBLIC FEEDS</strong></div>{([{key:'air',title:'Air / military',Icon:Plane},{key:'maritime',title:'Maritime',Icon:Ship}] as const).map(({key,title,Icon})=>{const feed=trafficHealth[key];return <div key={key}><span><Icon size={13}/> {title}: {feed.phase} · {feed.count.toLocaleString()} · {age(feed.updatedAt)}</span><span>{feed.cache?`cache ${feed.cache}`:feed.message}</span></div>;})}</section>
    <section className={styles.diagnostics}><div className={styles.rowBetween}><span>Runtime diagnostics</span><strong>{diagnostics.fps} FPS</strong></div><div><span>{diagnostics.objects.toLocaleString()} loaded live/intelligence objects</span><span>{diagnostics.heapMb === null ? 'Heap unavailable' : `${diagnostics.heapMb.toFixed(0)} MB JS heap`}</span></div></section>
    <p className={styles.disclaimer}>Atlas preserves provider timestamps and unknown values. A blank layer means “nothing received,” not “nothing exists.” Satellite positions are derived from current CelesTrak elements with SGP4/SDP4; spacecraft silhouettes are category representations derived from catalog names/groups, not reported attitude or exact bus geometry.</p>
  </div>;
}
