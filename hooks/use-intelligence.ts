"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY_HEALTH, type IntelligenceKind, type IntelligenceLayers, type IntelligenceSignal, type IntelligenceSnapshot, type SatelliteRecord, type SatelliteSnapshot, type SourceHealth } from '@/lib/intelligence/types';
import { propagateSatellites } from '@/lib/intelligence/sgp4';

export type IntelligenceFeed = { signals: IntelligenceSignal[]; health: SourceHealth; refresh: () => void };
const signalCache = new Map<string, IntelligenceSnapshot>();
const satelliteCache = new Map<string, SatelliteSnapshot>();

function useSignalFeed(kind: Exclude<IntelligenceKind, 'satellites'>, enabled: boolean, url: string, intervalMs: number): IntelligenceFeed {
  const [state, setState] = useState<IntelligenceSnapshot>(() => signalCache.get(url) || { signals: [], fetchedAt: 0, health: EMPTY_HEALTH(kind) });
  const [token, setToken] = useState(0);
  useEffect(() => {
    if (!enabled) { setState(old => ({ ...old, signals: [], health: { ...old.health, phase: 'off', message: 'Layer off', count: 0 } })); return; }
    const controller = new AbortController();
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden || controller.signal.aborted) return;
      busy = true;
      setState(old => ({ ...old, health: { ...old.health, phase: old.signals.length ? 'degraded' : 'loading', message: old.signals.length ? 'Refreshing…' : 'Connecting…' } }));
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json() as IntelligenceSnapshot & { error?: string };
        if (!response.ok || !Array.isArray(body.signals) || !body.health) throw new Error(body.error || 'Feed unavailable.');
        signalCache.set(url, body); setState(body);
      } catch (error) {
        if (!controller.signal.aborted) setState(old => ({ ...old, health: { ...old.health, phase: old.signals.length ? 'degraded' : 'unavailable', message: `${error instanceof Error ? error.message : 'Feed unavailable.'}${old.signals.length ? ' Last received data retained.' : ''}` } }));
      } finally { busy = false; }
    };
    const cached = signalCache.get(url); if (cached) setState(cached);
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [kind, enabled, url, intervalMs, token]);
  return { signals: enabled ? state.signals : [], health: enabled ? state.health : { ...state.health, phase: 'off', message: 'Layer off', count: 0 }, refresh: useCallback(() => setToken(value => value + 1), []) };
}

function useSatellites(enabled: boolean, group: string, replayAt: number | null): IntelligenceFeed {
  const url = `/api/intelligence/satellites?group=${encodeURIComponent(group)}`;
  const [catalog, setCatalog] = useState<SatelliteSnapshot>(() => satelliteCache.get(url) || { satellites: [], fetchedAt: 0, health: EMPTY_HEALTH('satellites') });
  const [signals, setSignals] = useState<IntelligenceSignal[]>([]);
  const [token, setToken] = useState(0);
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled) { setSignals([]); setCatalog(old => ({ ...old, health: { ...old.health, phase: 'off', message: 'Layer off', count: 0 } })); return; }
    const controller = new AbortController(); let busy = false;
    const refresh = async () => {
      if (busy || document.hidden || controller.signal.aborted) return;
      busy = true;
      setCatalog(old => ({ ...old, health: { ...old.health, phase: old.satellites.length ? 'degraded' : 'loading', message: old.satellites.length ? 'Refreshing elements…' : 'Loading orbital elements…' } }));
      try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json() as SatelliteSnapshot & { error?: string };
        if (!response.ok || !Array.isArray(body.satellites) || !body.health) throw new Error(body.error || 'Satellite catalog unavailable.');
        satelliteCache.set(url, body); setCatalog(body);
      } catch (error) {
        if (!controller.signal.aborted) setCatalog(old => ({ ...old, health: { ...old.health, phase: old.satellites.length ? 'degraded' : 'unavailable', message: `${error instanceof Error ? error.message : 'Satellite catalog unavailable.'}${old.satellites.length ? ' Cached elements retained.' : ''}` } }));
      } finally { busy = false; }
    };
    const cached = satelliteCache.get(url); if (cached) setCatalog(cached);
    void refresh(); const timer = setInterval(() => void refresh(), 60 * 60_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [enabled, url, token]);
  useEffect(() => {
    if (!enabled || !catalog.satellites.length) { setSignals([]); return; }
    let cancelled = false; const current = ++generation.current;
    const project = async () => {
      try {
        const at = new Date(replayAt ?? Date.now());
        const projected = await propagateSatellites(catalog.satellites, at);
        if (!cancelled && generation.current === current) setSignals(projected);
      } catch (error) {
        if (!cancelled) setCatalog(old => ({ ...old, health: { ...old.health, phase: 'degraded', message: error instanceof Error ? error.message : 'Satellite propagation unavailable.' } }));
      }
    };
    void project();
    const timer = replayAt === null ? setInterval(() => void project(), 10_000) : undefined;
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [enabled, catalog.satellites, replayAt]);
  const health = enabled ? { ...catalog.health, count: signals.length } : { ...catalog.health, phase: 'off' as const, message: 'Layer off', count: 0 };
  return { signals: enabled ? signals : [], health, refresh: useCallback(() => setToken(value => value + 1), []) };
}

export function useIntelligence(layers: IntelligenceLayers, ready: boolean, latitude: number, longitude: number, satelliteGroup: string, replayMinutes = 0) {
  const bucketLat = Math.round(latitude * 4) / 4, bucketLon = Math.round(longitude * 4) / 4;
  const active = ready;
  const earthquakes = useSignalFeed('earthquakes', active && layers.earthquakes, '/api/intelligence/earthquakes', 60_000);
  const fires = useSignalFeed('fires', active && layers.fires, `/api/intelligence/fires?lat=${bucketLat}&lon=${bucketLon}`, 5 * 60_000);
  const weather = useSignalFeed('weather', active && layers.weather, `/api/intelligence/weather?lat=${bucketLat}&lon=${bucketLon}`, 60_000);
  const replayAt = replayMinutes > 0 ? Date.now() - replayMinutes * 60_000 : null;
  const satellites = useSatellites(active && layers.satellites, satelliteGroup, replayAt);
  const allSignals = useMemo(() => {
    const target = replayAt ?? Date.now();
    const visible = (signals: IntelligenceSignal[]) => signals.filter(signal => signal.observedAt <= target && (signal.expiresAt === null || signal.expiresAt >= target));
    return [...visible(earthquakes.signals), ...visible(fires.signals), ...visible(weather.signals), ...satellites.signals];
  }, [earthquakes.signals, fires.signals, weather.signals, satellites.signals, replayAt]);
  return { earthquakes, fires, weather, satellites, allSignals, replayAt };
}
