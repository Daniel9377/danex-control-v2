const TTL = 300_000; // 5 minutes — avoids re-fetching on every SPA navigation

interface Entry<T> {
  data: T;
  ts: number;
}

// Module-level store — survives SPA route changes, cleared on full page reload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, Entry<any>>();

// ── Pub/sub for cache invalidation ──────────────────────────────────────────
// Hooks like useAllClientFinancials subscribe to invalidation events so they
// can automatically re-fetch when another part of the app calls cacheInvalidate.
type CacheListener = () => void;
const listeners = new Map<string, Set<CacheListener>>();

/** Registers a listener that fires when `key` is invalidated. Returns an unsubscribe function. */
export function cacheSubscribe(key: string, listener: CacheListener): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(listener);
  return () => { listeners.get(key)?.delete(listener); };
}

function notifyListeners(key: string): void {
  listeners.get(key)?.forEach((fn) => fn());
}

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T): void {
  store.set(key, { data, ts: Date.now() });
}

export function cacheInvalidate(...keys: string[]): void {
  for (const key of keys) {
    store.delete(key);
    notifyListeners(key);
  }
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      notifyListeners(key);
    }
  }
}
