import { logger } from "./logging/logger.js";

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class SimpleCache {
  private static MAX_SIZE = 1000;
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    if (this.cache.size >= SimpleCache.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    return entry !== undefined && !(Date.now() > entry.expiry);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

export const cache = new SimpleCache();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  if (cache.has(key)) {
    const cached = cache.get<T>(key);
    logger.debug(`Cache hit: ${key}`);
    return cached as T;
  }
  const result = await fn();
  cache.set(key, result, ttlMs);
  return result;
}
