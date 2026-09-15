"use client";

import { useEffect, useState } from 'react';
import { isFreshTarget, type TrafficLayers, type TrafficSnapshot, type TrafficTarget } from '@/lib/traffic';

type FeedState = { targets: TrafficTarget[]; phase: 'off' | 'loading' | 'live' | 'error'; message: string; updatedAt: number | null; limited: boolean };
const empty: FeedState = { targets: [], phase: 'off', message: '', updatedAt: null, limited: false };
function useFeed(feed: 'air' | 'maritime', enabled: boolean, latitude: number, longitude: number) {
  const [state, setState] = useState<FeedState>(empty);
  const lat = Math.round(latitude * 4) / 4, lon = Math.round(longitude * 4) / 4;
  useEffect(() => {
    if (!enabled) { setState(empty); return; }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>, busy = false;
    let targets = new Map<string, TrafficTarget>();
    const interval = feed === 'air' ? 20_000 : 60_000;
    setState({ ...empty, phase: 'loading' });
    const refresh = async () => {
      if (busy || document.hidden || controller.signal.aborted) return;
      clearTimeout(timer);
      busy = true;
      try {
        const response = await fetch(`/api/traffic/${feed}?lat=${lat}&lon=${lon}`, { signal: controller.signal });
        const data = await response.json() as TrafficSnapshot & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Feed unavailable. Retrying automatically.');
        if (!Array.isArray(data.targets)) throw new Error('Invalid feed response. Retrying automatically.');
        if (controller.signal.aborted) return;
        const snapshot = data as TrafficSnapshot;
        // AISStream supplies a partial sample per connection; retain fresh broadcasts between samples.
        if (feed === 'air' || snapshot.source !== 'AISStream') targets = new Map();
        for (const target of snapshot.targets) targets.set(target.id, target);
        for (const [id, target] of targets) if (!isFreshTarget(target)) targets.delete(id);
        setState({ targets: [...targets.values()], phase: 'live', message: snapshot.coverage,
          updatedAt: snapshot.fetchedAt, limited: Boolean(snapshot.limited) });
      } catch (error) {
        if (!controller.signal.aborted) {
          targets.clear();
          setState(previous => ({ ...previous, targets: [], phase: 'error',
            message: error instanceof Error ? error.message : 'Feed unavailable.', updatedAt: null }));
        }
      } finally {
        busy = false;
        if (!controller.signal.aborted) timer = setTimeout(refresh, interval);
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) void refresh();
    };
    // Wait for navigation to settle before requesting a new region.
    timer = setTimeout(refresh, 800);
    const expiry = setInterval(() => setState(previous => {
      const fresh = previous.targets.filter(target => isFreshTarget(target));
      return fresh.length === previous.targets.length ? previous : { ...previous, targets: fresh };
    }), 10_000);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      controller.abort(); clearTimeout(timer); clearInterval(expiry);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [feed, enabled, lat, lon]);
  return state;
}

export function useTraffic(layers: TrafficLayers, ready: boolean, latitude: number, longitude: number) {
  const air = useFeed('air', ready && (layers.air || layers.military), latitude, longitude);
  const maritime = useFeed('maritime', ready && layers.maritime, latitude, longitude);
  return { air, maritime };
}
