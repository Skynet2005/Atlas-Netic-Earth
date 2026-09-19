"use client";

import { useState } from 'react';
import { Plane, Route, X } from 'lucide-react';
import type { Globe } from '@/lib/globe';
import type { AirwayRoute, GroundAvoid, GroundProfile, GroundRoute, NotamResponse, RailJourney } from '@/lib/mobility/types';
import styles from './mobility-drawer.module.css';

type Tab = 'drive' | 'air' | 'rail';

function localDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return `${hours} hr ${remainder} min`;
}

function distance(meters: number) {
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: 'no-store' });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload && typeof (payload as {error?:unknown}).error === 'string'
      ? (payload as {error:string}).error
      : 'Provider request failed.';
    throw new Error(message);
  }
  return payload as T;
}

export default function MobilityDrawer({ open, onClose, getGlobe, ready }: {
  open: boolean;
  onClose: () => void;
  getGlobe: () => Globe | null;
  ready: boolean;
}) {
  const [tab, setTab] = useState<Tab>('drive');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [profile, setProfile] = useState<GroundProfile>('driving-car');
  const [avoid, setAvoid] = useState<GroundAvoid[]>(['tollways']);
  const [ground, setGround] = useState<GroundRoute | null>(null);

  const [airwayQuery, setAirwayQuery] = useState('');
  const [airway, setAirway] = useState<AirwayRoute | null>(null);
  const [notamLocation, setNotamLocation] = useState('');
  const [notams, setNotams] = useState<NotamResponse | null>(null);

  const [trainQuery, setTrainQuery] = useState('');
  const [serviceDate, setServiceDate] = useState(localDate);
  const [rail, setRail] = useState<RailJourney | null>(null);

  const showPath = (points: {latitude:number;longitude:number;name?:string}[], kind: 'ground'|'air'|'rail') => {
    const globe = getGlobe();
    globe?.showMobilityPath(points, kind);
    if (points.length) globe?.fitPoints(points);
  };

  const toggleAvoid = (value: GroundAvoid) => setAvoid(current =>
    current.includes(value) ? current.filter(item => item !== value) : [...current, value]
  );

  const directions = async () => {
    setBusy(true); setMessage('');
    try {
      const route = await json<GroundRoute>('/api/mobility/directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin, destination, profile, avoid }),
      });
      setGround(route); showPath(route.points, 'ground');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Directions unavailable.'); }
    finally { setBusy(false); }
  };

  const loadAirway = async () => {
    setBusy(true); setMessage('');
    try {
      const route = await json<AirwayRoute>(`/api/mobility/airways?airway=${encodeURIComponent(airwayQuery)}`);
      setAirway(route); showPath(route.points, 'air');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'FAA airway unavailable.'); }
    finally { setBusy(false); }
  };

  const loadNotams = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/mobility/notams?location=${encodeURIComponent(notamLocation)}`, { cache: 'no-store' });
      const payload = await response.json() as NotamResponse & { error?: string };
      if (payload.provider === 'FAA NMS') setNotams(payload);
      if (!response.ok && payload.error) setMessage(payload.error);
      else if (payload.phase !== 'live') setMessage(payload.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'FAA NMS unavailable.'); }
    finally { setBusy(false); }
  };

  const loadRail = async (tripId?: string) => {
    setBusy(true); setMessage('');
    try {
      const params = new URLSearchParams({ query: trainQuery, date: serviceDate });
      if (tripId) params.set('tripId', tripId);
      const journey = await json<RailJourney>(`/api/mobility/rail?${params}`);
      setRail(journey); showPath(journey.points, 'rail');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Amtrak schedule unavailable.'); }
    finally { setBusy(false); }
  };

  return <aside className={styles.drawer} hidden={!open} aria-label="Atlas Mobility Center">
    <header className={styles.heading}>
      <div><div className={styles.eyebrow}>MULTIMODAL PLANNING</div><h2>Mobility Center</h2><p>Road · airway · rail on the same 3D Earth</p></div>
      <button onClick={onClose} aria-label="Close Mobility Center"><X size={20}/></button>
    </header>

    <nav className={styles.tabs} aria-label="Mobility modes">
      <button data-active={tab === 'drive'} onClick={() => setTab('drive')}><Route size={15}/>Drive</button>
      <button data-active={tab === 'air'} onClick={() => setTab('air')}><Plane size={15}/>Air</button>
      <button data-active={tab === 'rail'} onClick={() => setTab('rail')}>↔ Rail</button>
    </nav>

    {message && <div className={styles.message} role="status">{message}<button onClick={() => setMessage('')} aria-label="Dismiss">×</button></div>}

    <div className={styles.body}>
      {tab === 'drive' && <>
        <section>
          <h3>Turn-by-turn directions</h3>
          <p className={styles.note}>Enter place names or coordinates. Route calculation stays server-side so provider keys never reach the browser.</p>
          <label>From<input value={origin} onChange={event => setOrigin(event.target.value)} placeholder="Robins AFB, GA or 32.64, -83.59"/></label>
          <label>To<input value={destination} onChange={event => setDestination(event.target.value)} placeholder="Destination"/></label>
          <label>Mode<select value={profile} onChange={event => setProfile(event.target.value as GroundProfile)}>
            <option value="driving-car">Drive</option><option value="foot-walking">Walk</option><option value="cycling-regular">Bike</option>
          </select></label>
          {profile === 'driving-car' && <div className={styles.options}>
            <span>Avoid</span>
            {([['tollways','Tolls'],['highways','Highways'],['ferries','Ferries']] as [GroundAvoid,string][]).map(([value,label]) =>
              <label key={value} className={styles.check}><input type="checkbox" checked={avoid.includes(value)} onChange={() => toggleAvoid(value)}/>{label}</label>
            )}
          </div>}
          <div className={styles.actions}><button className={styles.primary} disabled={busy || !origin.trim() || !destination.trim()} onClick={() => void directions()}>{busy ? 'Routing…' : 'Get directions'}</button>{ground && <button onClick={() => showPath(ground.points,'ground')}>Fit route</button>}</div>
        </section>
        {ground && <section className={styles.result}>
          <div className={styles.summary}><div><strong>{distance(ground.distanceMeters)}</strong><span>distance</span></div><div><strong>{duration(ground.durationSeconds)}</strong><span>estimated</span></div><div><strong>{ground.steps.length}</strong><span>maneuvers</span></div></div>
          <p className={styles.routeTitle}>{ground.origin.name || 'Origin'} <span>→</span> {ground.destination.name || 'Destination'}</p>
          {ground.avoided.length > 0 && <p className={styles.chips}>{ground.avoided.map(item => <span key={item}>avoid {item}</span>)}</p>}
          <ol className={styles.steps}>{ground.steps.map((step,index) => <li key={index}><span>{index + 1}</span><div><strong>{step.instruction}</strong>{step.name && <small>{step.name}</small>}<small>{distance(step.distanceMeters)} · {duration(step.durationSeconds)}</small></div></li>)}</ol>
          <p className={styles.disclaimer}>Provider-computed road guidance. Conditions, closures and traffic can change; obey posted signs and restrictions.</p>
        </section>}
      </>}

      {tab === 'air' && <>
        <section>
          <h3>FAA airway explorer</h3>
          <p className={styles.note}>Loads the effective FAA 28-day NASR airway definition and resolves its published fixes/navaids onto the globe.</p>
          <div className={styles.inline}><input value={airwayQuery} onChange={event => setAirwayQuery(event.target.value.toUpperCase())} placeholder="V16, J75, Q40" maxLength={12}/><button className={styles.primary} disabled={busy || !airwayQuery.trim()} onClick={() => void loadAirway()}>Load airway</button></div>
        </section>
        {airway && <section className={styles.result}>
          <div className={styles.resultHeader}><div><span className={styles.badge}>FAA NASR</span><h3>{airway.airwayId}</h3></div><button onClick={() => showPath(airway.points,'air')}>Fit</button></div>
          <dl className={styles.grid}><div><dt>Effective</dt><dd>{airway.effectiveDate}</dd></div><div><dt>Resolved fixes</dt><dd>{airway.points.length}</dd></div><div><dt>Segments</dt><dd>{airway.segments.length}</dd></div><div><dt>Unresolved</dt><dd>{airway.unresolvedPoints.length}</dd></div></dl>
          {airway.remark && <p className={styles.callout}>{airway.remark}</p>}
          <div className={styles.pointStrip}>{airway.points.slice(0,40).map((point,index) => <span key={`${point.name}-${index}`}>{point.name || index + 1}</span>)}{airway.points.length > 40 && <span>+{airway.points.length - 40}</span>}</div>
          {airway.segments.some(segment => segment.minimumEnrouteAltitude || segment.maximumAuthorizedAltitude) && <details><summary>Altitude constraints</summary><div className={styles.segmentList}>{airway.segments.filter(segment => segment.minimumEnrouteAltitude || segment.maximumAuthorizedAltitude).slice(0,60).map(segment => <div key={segment.sequence}><strong>{segment.from || '—'} → {segment.to || '—'}</strong><span>MEA {segment.minimumEnrouteAltitude || '—'} · MAA {segment.maximumAuthorizedAltitude || '—'}</span></div>)}</div></details>}
        </section>}
        <section>
          <h3>Live NOTAM channel</h3>
          <p className={styles.note}>Atlas uses the FAA’s new NMS API only when authorized API access is configured. It does not scrape NOTAM Search or manufacture notices.</p>
          <div className={styles.inline}><input value={notamLocation} onChange={event => setNotamLocation(event.target.value.toUpperCase())} placeholder="KCAE" maxLength={8}/><button disabled={busy || !notamLocation.trim()} onClick={() => void loadNotams()}>Check NMS</button></div>
          {notams && <div className={styles.notamStatus} data-phase={notams.phase}><strong>{notams.phase === 'live' ? 'NMS LIVE' : notams.phase === 'not_configured' ? 'NMS ACCESS REQUIRED' : 'NMS UNAVAILABLE'}</strong><span>{notams.message}</span></div>}
          {notams?.records.map(record => <article className={styles.notam} key={record.id}><header><strong>{record.id}</strong><span>{record.location}</span></header><p>{record.text}</p>{(record.effectiveStart || record.effectiveEnd) && <small>{record.effectiveStart || '—'} → {record.effectiveEnd || '—'}</small>}</article>)}
          <a className={styles.external} href="https://notams.aim.faa.gov/notamSearch/" target="_blank" rel="noreferrer">Open official FAA NOTAM Search ↗</a>
          <p className={styles.disclaimer}>Situational awareness only. Do not use Atlas-Netic as the sole source for operational preflight or regulatory compliance.</p>
        </section>
      </>}

      {tab === 'rail' && <>
        <section>
          <h3>Amtrak schedule & route</h3>
          <p className={styles.note}>Search by train number or route name. Atlas reads Amtrak’s official GTFS schedule and draws the published GTFS shape on the globe.</p>
          <div className={styles.twoFields}><label>Train / route<input value={trainQuery} onChange={event => setTrainQuery(event.target.value)} placeholder="97 or Silver Meteor"/></label><label>Service date<input type="date" value={serviceDate} onChange={event => setServiceDate(event.target.value)}/></label></div>
          <button className={styles.primary} disabled={busy || !trainQuery.trim() || !serviceDate} onClick={() => void loadRail()}>{busy ? 'Loading…' : 'Find train'}</button>
        </section>
        {rail && <section className={styles.result}>
          <div className={styles.resultHeader}><div><span className={styles.badge}>SCHEDULED GTFS</span><h3>Train {rail.train}</h3><p>{rail.route}{rail.headsign ? ` · ${rail.headsign}` : ''}</p></div><button onClick={() => showPath(rail.points,'rail')}>Fit</button></div>
          <dl className={styles.grid}><div><dt>Date</dt><dd>{rail.serviceDate}</dd></div><div><dt>Stops</dt><dd>{rail.stops.length}</dd></div><div><dt>Shape points</dt><dd>{rail.points.length}</dd></div><div><dt>Realtime</dt><dd>No</dd></div></dl>
          {rail.alternatives.length > 1 && <details><summary>Other matching trips</summary><div className={styles.altList}>{rail.alternatives.filter(item => item.tripId !== rail.tripId).map(item => <button key={item.tripId} onClick={() => void loadRail(item.tripId)}>Train {item.train}<small>{item.route} · {item.headsign}</small></button>)}</div></details>}
          <div className={styles.stationList}>{rail.stops.map(stop => <div key={`${stop.stopId}-${stop.sequence}`}><span>{stop.sequence}</span><div><strong>{stop.name}</strong><small>Arr {stop.arrival || '—'} · Dep {stop.departure || '—'}</small></div></div>)}</div>
          <p className={styles.disclaimer}>This is Amtrak scheduled GTFS, not a live train-position feed. Atlas labels it scheduled rather than implying realtime status.</p>
        </section>}
      </>}
    </div>

    <footer className={styles.footer}><button disabled={!ready} onClick={() => { getGlobe()?.clearMobilityPath(); setGround(null); setAirway(null); setRail(null); }}>Clear mobility overlay</button><span>Atlas-Netic v2.8 mobility</span></footer>
  </aside>;
}
