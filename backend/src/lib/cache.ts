import { LRUCache } from 'lru-cache';

/**
 * Small TTL cache with request coalescing: concurrent callers asking for the
 * same key share one upstream request instead of stampeding the provider.
 */
export class TtlCache {
  private readonly lru: LRUCache<string, { value: unknown }>;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(max: number) {
    this.lru = new LRUCache({ max, ttlAutopurge: false });
  }

  async wrap<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const hit = this.lru.get(key);
    if (hit) return hit.value as T;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const p = load()
      .then((value) => {
        this.lru.set(key, { value }, { ttl: ttlMs });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  clear() {
    this.lru.clear();
  }
}
