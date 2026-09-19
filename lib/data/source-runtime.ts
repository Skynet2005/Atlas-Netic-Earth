export type CacheDisposition = 'hit' | 'miss' | 'coalesced' | 'stale';
export type SourceRuntimeState = 'live' | 'stale';

export type SourceResult<T> = {
  data: T;
  fetchedAt: number;
  latencyMs: number;
  state: SourceRuntimeState;
  cache: CacheDisposition;
  error?: string;
};

type CacheEntry<T> = { data: T; fetchedAt: number; latencyMs: number };
type SourceOptions<T> = {
  key: string;
  ttlMs: number;
  staleMs: number;
  loader: () => Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<SourceResult<unknown>>>();
const MAX_CACHE_ENTRIES = 128;

function rememberCacheEntry<T>(key: string, entry: CacheEntry<T>) {
  cache.delete(key);
  cache.set(key, entry as CacheEntry<unknown>);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

export class ProviderError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchProvider(url: string, init: RequestInit = {}, options: { timeoutMs?: number; retries?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
      if (response.ok) return response;
      const wait = retryAfter(response.headers.get('retry-after'));
      const message = `Provider returned HTTP ${response.status}`;
      const error = new ProviderError(message, response.status, wait);
      if (attempt >= retries || ![408, 425, 429, 500, 502, 503, 504].includes(response.status)) throw error;
      await sleep(Math.min(2500, wait ?? (300 * 2 ** attempt + Math.random() * 200)));
      lastError = error;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      const wait = error instanceof ProviderError ? error.retryAfterMs : null;
      await sleep(Math.min(2500, wait ?? (300 * 2 ** attempt + Math.random() * 200)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Provider request failed');
}

export async function cachedSource<T>({ key, ttlMs, staleMs, loader }: SourceOptions<T>): Promise<SourceResult<T>> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && now - existing.fetchedAt <= ttlMs) {
    return { ...existing, state: 'live', cache: 'hit' };
  }
  const active = inflight.get(key) as Promise<SourceResult<T>> | undefined;
  if (active) {
    const joined = await active;
    return { ...joined, cache: joined.cache === 'stale' ? 'stale' : 'coalesced' };
  }
  const request = (async (): Promise<SourceResult<T>> => {
    const started = Date.now();
    try {
      const data = await loader();
      const entry: CacheEntry<T> = { data, fetchedAt: Date.now(), latencyMs: Date.now() - started };
      rememberCacheEntry(key, entry);
      return { ...entry, state: 'live', cache: 'miss' };
    } catch (error) {
      const stale = cache.get(key) as CacheEntry<T> | undefined;
      if (stale && Date.now() - stale.fetchedAt <= staleMs) {
        return { ...stale, state: 'stale', cache: 'stale', error: error instanceof Error ? error.message : 'Provider request failed' };
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request as Promise<SourceResult<unknown>>);
  return request;
}

export function clearSourceRuntimeForTests() {
  cache.clear();
  inflight.clear();
}
