"use client";

import { Plane, Radar, Ship } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { TrafficLayers } from '@/lib/traffic';
import type { useTraffic } from '@/hooks/use-traffic';

export function TrafficPanel({ layers, onChange, feeds, onBaltic }: {
  layers: TrafficLayers; onChange: (value: TrafficLayers) => void;
  feeds: ReturnType<typeof useTraffic>; onBaltic: () => void;
}) {
  const rows = [{ kind: 'air', title: 'Air traffic', Icon: Plane },
    { kind: 'military', title: 'Military aircraft', Icon: Radar },
    { kind: 'maritime', title: 'Maritime traffic', Icon: Ship }] as const;
  return <section className="panel-section traffic-panel" aria-label="Transponder traffic">
    <span className="section-label">TRANSPONDER TRAFFIC</span>
    <p className="traffic-intro">Reports near your view center · 250 nm</p>
    {rows.map(({ kind, title, Icon }) => {
      const feed = kind === 'maritime' ? feeds.maritime : feeds.air;
      const count = feed.targets.filter(target => target.kind === kind).length;
      return <div className={`traffic-layer traffic-${kind}`} key={kind}>
        <label className="layer-row" htmlFor={`traffic-${kind}`}><span><Icon size={17}/>{title}</span>
          <Switch id={`traffic-${kind}`} checked={layers[kind]} onCheckedChange={value => onChange({ ...layers, [kind]: value })}/></label>
        {layers[kind] && <p className="traffic-feed-status" role="status">
          {feed.phase === 'off' ? 'Waiting for the globe…' : feed.phase === 'loading' ? 'Connecting to feed…' : feed.phase === 'error' ? feed.message : `${count} reported · ${feed.updatedAt ? new Date(feed.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Waiting'}`}
        </p>}
      </div>;
    })}
    {(layers.air || layers.military) && <p className="traffic-note">Aircraft refresh every 20 seconds. Only received public broadcasts appear. Military identification is supplied by the feed and may be incomplete.</p>}
    {layers.maritime && <div className="traffic-note">
      <p>{feeds.maritime.phase === 'loading' ? 'Checking AIS coverage…' : feeds.maritime.message}</p>
      {feeds.maritime.limited && <><button className="traffic-link" onClick={onBaltic}>Explore Baltic AIS coverage ↗</button><p>Worldwide AIS requires a connected provider. This open feed covers Finnish waters.</p></>}
      <p>Updates every 60 seconds. Vessel reports expire after 15 minutes.</p>
    </div>}
    <p className="traffic-source"><a href="https://www.adsb.lol/docs/open-data/api/" target="_blank" rel="noreferrer">ADSB.lol · ODbL</a><span> · </span><a href="https://www.digitraffic.fi/en/marine-traffic/" target="_blank" rel="noreferrer">Fintraffic · CC BY 4.0</a>{feeds.maritime.phase === 'live' && !feeds.maritime.limited && <> · <a href="https://aisstream.io" target="_blank" rel="noreferrer">AISStream</a></>}</p>
  </section>;
}
