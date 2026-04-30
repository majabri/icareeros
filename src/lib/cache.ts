/**
 * Lightweight response cache with two backends:
 *
 * 1. Upstash Redis (production) — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * 2. In-memory LRU (dev / CI fallback) — capped at MAX_ENTRIES entries
 *
 * Usage:
 *   const cached = await cache.get(key);
 *   if (cached) return NextResponse.json(cached);
 *   // ... compute result ...
 *   await cache.set(key, result, ttlSeconds);
 */

const MAX_ENTRIES = 256;
const DEFAULT_TTL = 60 * 60; // 1 hour

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // ms epoch
}

// ── In-memory LRU (dev/CI) ───────────────────────────────────────────────────

class MemCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // LRU: re-insert at end
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): void {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  del(key: string): void {
    this.store.delete(key);
  }

  size(): number {
    return this.store.size;
  }
}

const memCache = new MemCache();

// ── Upstash Redis (production) ───────────────────────────────────────────────

async function redisGet<T>(key: string): Promise<T | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { result: string | null };
    if (!json.result) return null;
    return JSON.parse(json.result) as T;
  } catch {
    return null;
  }
}

async function redisSet<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ value: JSON.stringify(value), ex: ttlSeconds }),
    });
  } catch {
    // Non-fatal: cache miss is acceptable
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

const hasRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (hasRedis) return redisGet<T>(key);
    return memCache.get<T>(key);
  },

  async set<T>(key: string, value: T, ttlSeconds = DEFAULT_TTL): Promise<void> {
    if (hasRedis) return redisSet(key, value, ttlSeconds);
    memCache.set(key, value, ttlSeconds);
  },

  async del(key: string): Promise<void> {
    if (hasRedis) {
      const url = process.env.UPSTASH_REDIS_REST_URL;
      const token = process.env.UPSTASH_REDIS_REST_TOKEN;
      if (url && token) {
        await fetch(`${url}/del/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    } else {
      memCache.del(key);
    }
  },

  /** Stable hash key from any JSON-serialisable object */
  key(...parts: unknown[]): string {
    return parts.map(p => JSON.stringify(p)).join("|");
  },
};
