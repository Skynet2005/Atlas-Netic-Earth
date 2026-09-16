import { aisBoundingBoxes, parseAISMessage, type TrafficTarget } from './traffic';

// Coalesce concurrent requests within an instance. The provider caps concurrent connections;
// high-volume deployments should use a persistent shared AIS collector instead.
let pending: Promise<TrafficTarget[]> | undefined;
let pendingArea = '';
let cached: { area: string; expires: number; targets: TrafficTarget[] } | undefined;
export async function readAISStream(key: string, latitude: number, longitude: number) {
  const area = `${latitude},${longitude}`;
  if (cached?.area === area && cached.expires > Date.now()) return cached.targets;
  if (pending) {
    if (pendingArea === area) return pending;
    throw new Error('AIS collector busy');
  }
  pendingArea = area;
  pending = new Promise<TrafficTarget[]>((resolve, reject) => {
    const socket = new WebSocket('wss://stream.aisstream.io/v0/stream');
    socket.binaryType = 'arraybuffer';
    const targets = new Map<string, TrafficTarget>();
    let finished = false, subscribed = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      socket.close();
      if (error) reject(error); else resolve([...targets.values()].slice(0, 1500));
    };
    const timeout = setTimeout(() => finish(subscribed ? undefined : new Error('AIS connection timed out')), 4_000);
    socket.addEventListener('open', () => {
      subscribed = true;
      socket.send(JSON.stringify({ APIKey: key, BoundingBoxes: aisBoundingBoxes(latitude, longitude),
        FilterMessageTypes: ['PositionReport', 'StandardClassBPositionReport', 'ExtendedClassBPositionReport'] }));
    });
    socket.addEventListener('message', event => {
      try {
        const data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer));
        if (data.error || data.Error) { finish(new Error('AIS provider rejected the subscription')); return; }
        const target = parseAISMessage(data);
        if (target && targets.size < 1500) targets.set(target.id, target);
      } catch { /* Ignore malformed individual broadcasts. */ }
    });
    socket.addEventListener('error', () => finish(new Error('AIS connection unavailable')));
    socket.addEventListener('close', () => { if (!finished) finish(new Error('AIS connection closed')); });
  });
  try {
    const targets = await pending;
    cached = { area, targets, expires: Date.now() + 30_000 };
    return targets;
  } finally { pending = undefined; }
}
