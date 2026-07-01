/**
 * Tiny IndexedDB wrapper used to cache fetched book metadata so we avoid
 * hammering the Open Library / Google Books APIs and can show saved books
 * offline. Falls back gracefully to an in-memory map if IndexedDB is missing.
 */
import type { BookMeta } from "../types";

const DB_NAME = "romi-books";
const STORE = "book-meta";
const VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedEntry {
  key: string;
  meta: BookMeta;
  fetchedAt: number;
}

const memoryCache = new Map<string, CachedEntry>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

export async function getCachedMeta(key: string): Promise<BookMeta | null> {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.fetchedAt < TTL_MS) return mem.meta;

  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => {
      const entry = req.result as CachedEntry | undefined;
      if (entry && Date.now() - entry.fetchedAt < TTL_MS) {
        memoryCache.set(key, entry);
        resolve(entry.meta);
      } else {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

/** Synchronous read from the in-memory layer (populated after warmMetaCache or setCachedMeta). */
export function getCachedMetaSync(key: string): BookMeta | null {
  const mem = memoryCache.get(key);
  if (mem && Date.now() - mem.fetchedAt < TTL_MS) return mem.meta;
  return null;
}

/** Bulk-load IndexedDB entries into memory so detail views open instantly. */
export async function warmMetaCache(): Promise<number> {
  const db = await openDb();
  if (!db) return 0;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const entries = (req.result ?? []) as CachedEntry[];
      let loaded = 0;
      const now = Date.now();
      for (const entry of entries) {
        if (now - entry.fetchedAt < TTL_MS) {
          memoryCache.set(entry.key, entry);
          loaded++;
        }
      }
      resolve(loaded);
    };
    req.onerror = () => resolve(0);
  });
}

export async function setCachedMeta(key: string, meta: BookMeta): Promise<void> {
  const entry: CachedEntry = { key, meta, fetchedAt: Date.now() };
  memoryCache.set(key, entry);

  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
  } catch {
    // Ignore write failures — the in-memory cache still serves this session.
  }
}

const EMPTY_META: BookMeta = {
  coverUrl: null,
  description: null,
  categories: [],
  price: null,
  buyUrl: "",
  pageCount: null,
  publishedDate: null,
  previewLink: null,
};

/** Update just the cover in cache (after a fast cover race). */
export async function patchCachedCover(key: string, coverUrl: string | null): Promise<void> {
  const existing = (await getCachedMeta(key)) ?? { ...EMPTY_META };
  await setCachedMeta(key, { ...existing, coverUrl });
}
