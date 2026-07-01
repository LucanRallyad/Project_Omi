/**
 * Unified persistence layer for swipes, saved books, and learned taste weights.
 *
 * When Supabase is configured it is the source of truth (cloud sync across
 * devices). Otherwise everything falls back to localStorage so the app is fully
 * usable during development and even if the network is down.
 */
import type { Book, DiscoverSession, SavedBook, SwipeDirection, TasteWeight } from "../types";
import { extractSwipeDeltas } from "./tasteWeights";
import { PROFILE_ID, isSupabaseConfigured, supabase } from "./supabase";

const LS_SWIPES = "romi.swipes";
const LS_SAVED = "romi.saved";
const LS_WEIGHTS = "romi.weights";
const LS_SWIPE_WEIGHTS = "romi.swipe_weights";
const LS_REGISTRY = "romi.registry";
const LS_DISCOVER_SESSION = "romi.discover_session";

interface SwipeRecord {
  book_key: string;
  direction: SwipeDirection;
  created_at: string;
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable — nothing more we can do.
  }
}

// ---------------------------------------------------------------------------
// Swipes (like / pass). Skips are intentionally never persisted.
// ---------------------------------------------------------------------------

export async function loadSwipes(): Promise<SwipeRecord[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("swipes")
      .select("book_key, direction, created_at")
      .eq("profile_id", PROFILE_ID);
    if (!error && data) return data as SwipeRecord[];
  }
  return readLS<SwipeRecord[]>(LS_SWIPES, []);
}

export async function recordSwipe(bookKey: string, direction: SwipeDirection): Promise<void> {
  const record: SwipeRecord = {
    book_key: bookKey,
    direction,
    created_at: new Date().toISOString(),
  };

  const local = readLS<SwipeRecord[]>(LS_SWIPES, []).filter((s) => s.book_key !== bookKey);
  writeLS(LS_SWIPES, [...local, record]);

  if (isSupabaseConfigured && supabase) {
    await supabase
      .from("swipes")
      .upsert({ ...record, profile_id: PROFILE_ID }, { onConflict: "profile_id,book_key" });
  }
}

export async function removeSwipe(bookKey: string): Promise<void> {
  const local = readLS<SwipeRecord[]>(LS_SWIPES, []).filter((s) => s.book_key !== bookKey);
  writeLS(LS_SWIPES, local);

  if (isSupabaseConfigured && supabase) {
    await supabase.from("swipes").delete().eq("profile_id", PROFILE_ID).eq("book_key", bookKey);
  }
}

// ---------------------------------------------------------------------------
// Saved books (bookmarks).
// ---------------------------------------------------------------------------

export async function loadSaved(): Promise<SavedBook[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("saved_books")
      .select("book_key, title, author, cover_url, buy_url, saved_at")
      .eq("profile_id", PROFILE_ID)
      .order("saved_at", { ascending: false });
    if (!error && data) return data as SavedBook[];
  }
  return readLS<SavedBook[]>(LS_SAVED, []);
}

export async function saveBook(book: Book, coverUrl: string | null, buyUrl: string | null): Promise<void> {
  const entry: SavedBook = {
    book_key: book.key,
    title: book.title,
    author: book.author,
    cover_url: coverUrl,
    buy_url: buyUrl,
    saved_at: new Date().toISOString(),
  };

  const local = readLS<SavedBook[]>(LS_SAVED, []).filter((b) => b.book_key !== book.key);
  writeLS(LS_SAVED, [entry, ...local]);

  if (isSupabaseConfigured && supabase) {
    await supabase
      .from("saved_books")
      .upsert({ ...entry, profile_id: PROFILE_ID }, { onConflict: "profile_id,book_key" });
  }
}

export async function unsaveBook(bookKey: string): Promise<void> {
  const local = readLS<SavedBook[]>(LS_SAVED, []).filter((b) => b.book_key !== bookKey);
  writeLS(LS_SAVED, local);

  if (isSupabaseConfigured && supabase) {
    await supabase.from("saved_books").delete().eq("profile_id", PROFILE_ID).eq("book_key", bookKey);
  }
}

// ---------------------------------------------------------------------------
// Book registry: a local lookup of every book that has entered the queue, so
// shelves (e.g. Liked) can render title/author/cover for API-sourced books
// whose only persisted trace is a swipe record.
// ---------------------------------------------------------------------------

export interface RegisteredBook extends Book {
  coverUrl: string | null;
}

export function registerBook(book: Book, coverUrl: string | null, categories?: string[]): void {
  const registry = readLS<Record<string, RegisteredBook>>(LS_REGISTRY, {});
  registry[book.key] = { ...book, coverUrl, categories: categories ?? book.categories };
  writeLS(LS_REGISTRY, registry);
}

export function loadRegistry(): Record<string, RegisteredBook> {
  return readLS<Record<string, RegisteredBook>>(LS_REGISTRY, {});
}

// ---------------------------------------------------------------------------
// Learned taste weights.
// ---------------------------------------------------------------------------

/** Library baseline weights (Goodreads seed). Updated by sync, not by swipes. */
export async function loadWeights(): Promise<TasteWeight[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("taste_weights")
      .select("feature_type, feature_value, weight")
      .eq("profile_id", PROFILE_ID);
    if (!error && data) return data as TasteWeight[];
  }
  return readLS<TasteWeight[]>(LS_WEIGHTS, []);
}

export async function saveWeights(weights: TasteWeight[]): Promise<void> {
  writeLS(LS_WEIGHTS, weights);

  if (isSupabaseConfigured && supabase && weights.length) {
    await supabase.from("taste_weights").upsert(
      weights.map((w) => ({ ...w, profile_id: PROFILE_ID })),
      { onConflict: "profile_id,feature_type,feature_value" }
    );
  }
}

/** In-app swipe deltas — persisted separately so Goodreads sync never wipes them. */
export async function loadSwipeWeights(): Promise<TasteWeight[]> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("swipe_weights")
      .select("feature_type, feature_value, weight")
      .eq("profile_id", PROFILE_ID);
    if (!error && data?.length) return data as TasteWeight[];

    const legacy = await loadWeights();
    const deltas = extractSwipeDeltas(legacy);
    if (deltas.length) await saveSwipeWeights(deltas);
    return deltas;
  }

  const stored = readLS<TasteWeight[]>(LS_SWIPE_WEIGHTS, []);
  if (stored.length) return stored;

  const legacy = readLS<TasteWeight[]>(LS_WEIGHTS, []);
  const deltas = extractSwipeDeltas(legacy);
  if (deltas.length) writeLS(LS_SWIPE_WEIGHTS, deltas);
  return deltas;
}

export async function saveSwipeWeights(weights: TasteWeight[]): Promise<void> {
  writeLS(LS_SWIPE_WEIGHTS, weights);

  if (isSupabaseConfigured && supabase) {
    if (!weights.length) {
      await supabase.from("swipe_weights").delete().eq("profile_id", PROFILE_ID);
      return;
    }
    await supabase.from("swipe_weights").upsert(
      weights.map((w) => ({ ...w, profile_id: PROFILE_ID })),
      { onConflict: "profile_id,feature_type,feature_value" }
    );
  }
}

// ---------------------------------------------------------------------------
// Discover carousel session (queue + scroll position).
// ---------------------------------------------------------------------------

export async function loadDiscoverSession(): Promise<DiscoverSession | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from("discover_session")
      .select("queue_json, active_index, updated_at")
      .eq("profile_id", PROFILE_ID)
      .maybeSingle();
    if (!error && data) {
      return {
        queue: (data.queue_json as Book[]) ?? [],
        active_index: data.active_index,
        updated_at: data.updated_at,
      };
    }
  }
  return readLS<DiscoverSession | null>(LS_DISCOVER_SESSION, null);
}

export async function saveDiscoverSession(queue: Book[], activeIndex: number): Promise<void> {
  const session: DiscoverSession = {
    queue,
    active_index: activeIndex,
    updated_at: new Date().toISOString(),
  };
  writeLS(LS_DISCOVER_SESSION, session);

  if (isSupabaseConfigured && supabase) {
    await supabase.from("discover_session").upsert(
      {
        profile_id: PROFILE_ID,
        queue_json: queue,
        active_index: activeIndex,
        updated_at: session.updated_at,
      },
      { onConflict: "profile_id" }
    );
  }
}

/** Drop swiped books and remap the active index to the same visible card. */
export function reconcileDiscoverSession(
  session: DiscoverSession,
  exclude: Set<string>
): { queue: Book[]; activeIndex: number } | null {
  const filtered = session.queue.filter((b) => !exclude.has(b.key));
  if (!filtered.length) return null;

  const clamped = Math.min(Math.max(0, session.active_index), session.queue.length - 1);
  const targetKey = session.queue[clamped]?.key;
  if (targetKey && !exclude.has(targetKey)) {
    const idx = filtered.findIndex((b) => b.key === targetKey);
    if (idx >= 0) return { queue: filtered, activeIndex: idx };
  }

  let activeIndex = 0;
  for (let i = 0; i < session.active_index && i < session.queue.length; i++) {
    if (!exclude.has(session.queue[i].key)) activeIndex++;
  }
  return { queue: filtered, activeIndex: Math.min(activeIndex, filtered.length - 1) };
}
