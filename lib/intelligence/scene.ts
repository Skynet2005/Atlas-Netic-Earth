import type { CameraSnapshot } from '@/lib/session';
import type { TrafficLayers } from '@/lib/traffic';
import type { IntelligenceLayers } from './types';

export type AtlasScene = {
  version: 2;
  camera: CameraSnapshot;
  surface: 'satellite' | 'relief';
  terrain: boolean;
  borders: boolean;
  labels: boolean;
  exaggeration: number;
  traffic: TrafficLayers;
  intelligence: IntelligenceLayers;
  satelliteGroup: string;
  replayMinutes: number;
};

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}
export function encodeScene(scene: AtlasScene) { return toBase64Url(JSON.stringify(scene)); }
export function decodeScene(value: string): AtlasScene | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as AtlasScene;
    if (parsed.version !== 2 || !parsed.camera || !parsed.traffic || !parsed.intelligence) return null;
    return parsed;
  } catch { return null; }
}
export function readSceneHash(hash = location.hash) {
  const match = hash.match(/(?:^#|&)scene=([^&]+)/);
  return match ? decodeScene(match[1]) : null;
}
