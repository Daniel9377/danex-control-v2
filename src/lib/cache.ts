const TTL = 30_000;

interface Entry<T> {
  data: T;
  ts: number;
}

// Module-level store — survives SPA route changes, cleared on full page reload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, Entry<any>>();

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
  for (const key of keys) store.delete(key);
}

export function cacheInvalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
