import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Bookmark, Heart, BookMarked, Sparkles } from "lucide-react";
import type { Book, SavedBook, ShelfView, SwipeDirection, TasteWeight } from "./types";
import {
  generateCandidates,
  learnFromSwipe,
  buildLibraryExclusionSet,
  resolveTasteProfile,
  wantToReadBooks,
  type TasteProfile,
} from "./lib/recommender";
import { fetchCoverUrl } from "./lib/bookApi";
import { allLibraryCoverEntries } from "./lib/libraryCovers";
import {
  loadRegistry,
  loadSaved,
  loadSwipes,
  loadWeights,
  recordSwipe,
  registerBook,
  removeSwipe,
  saveBook,
  saveWeights,
  unsaveBook,
} from "./lib/store";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { NavBar } from "./components/NavBar";
import { CoverflowCarousel } from "./components/CoverflowCarousel";
import { CarouselSkeleton } from "./components/CarouselSkeleton";
import { BookDetail } from "./components/BookDetail";
import { Shelf, type ShelfItem } from "./components/Shelf";
import { EmptyState } from "./components/EmptyState";
import { UndoToast } from "./components/UndoToast";
import { PasscodeGate } from "./components/PasscodeGate";
import type { SwipeAction } from "./components/SwipeCard";
import { useViewport } from "./hooks/useViewport";

interface UndoState {
  book: Book;
  direction: SwipeDirection;
  reverseWeights: TasteWeight[];
}

const REFRESH_THRESHOLD = 5;

/** Rebuild a minimal Book from a persisted SavedBook row. */
function savedToBook(s: SavedBook): Book {
  const isbn13 = s.book_key.startsWith("isbn:") ? s.book_key.slice(5) : null;
  return {
    key: s.book_key,
    title: s.title,
    author: s.author,
    series: null,
    seriesNumber: null,
    isbn13,
    goodreadsUrl: null,
    averageRating: null,
  };
}

export default function App() {
  const [entered, setEntered] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("go")
  );
  const [view, setView] = useState<ShelfView>(() => {
    if (typeof window === "undefined") return "discover";
    const v = new URLSearchParams(window.location.search).get("view");
    return (["discover", "saved", "liked", "want-to-read"] as const).includes(v as ShelfView)
      ? (v as ShelfView)
      : "discover";
  });

  const [queue, setQueue] = useState<Book[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [covers, setCovers] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);

  const [saved, setSaved] = useState<SavedBook[]>([]);
  const [likedKeys, setLikedKeys] = useState<string[]>([]);
  const [detailBook, setDetailBook] = useState<Book | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);

  const profileRef = useRef<TasteProfile | null>(null);
  const weightsRef = useRef<TasteWeight[]>([]);
  const excludeRef = useRef<Set<string>>(new Set());
  const coversRef = useRef<Set<string>>(new Set());
  const coversInFlight = useRef<Set<string>>(new Set());
  const categoriesRef = useRef<Map<string, string[]>>(new Map());
  const undoTimer = useRef<number | null>(null);
  const fetchingMore = useRef(false);

  const savedKeys = useMemo(() => new Set(saved.map((s) => s.book_key)), [saved]);

  // -------------------------------------------------------------------------
  // Cover fetching: keep a sliding window of covers loaded around the active
  // card so nothing pops in, and register each book for the shelves.
  // -------------------------------------------------------------------------
  const ensureCovers = useCallback(async (books: Book[], priorityKey?: string) => {
    const pending = books.filter(
      (b) => !coversRef.current.has(b.key) && !coversInFlight.current.has(b.key)
    );
    if (!pending.length) return;

    // Instant preview from baked library / search seeds while full lookup runs.
    for (const book of pending) {
      const preview = book.seedCoverUrl ?? allLibraryCoverEntries()[book.key] ?? null;
      if (preview) {
        setCovers((prev) => new Map(prev).set(book.key, preview));
      }
    }

    let queue = [...pending];
    if (priorityKey) {
      queue = [
        ...queue.filter((b) => b.key === priorityKey),
        ...queue.filter((b) => b.key !== priorityKey),
      ];
    }

    const concurrency = 10;
    const load = async (book: Book) => {
      coversInFlight.current.add(book.key);
      try {
        const url = await fetchCoverUrl(book);
        registerBook(book, url, book.categories);
        setCovers((prev) => new Map(prev).set(book.key, url));
        if (url) coversRef.current.add(book.key);
      } catch {
        const fallback = book.seedCoverUrl ?? allLibraryCoverEntries()[book.key] ?? null;
        setCovers((prev) => new Map(prev).set(book.key, fallback));
      } finally {
        coversInFlight.current.delete(book.key);
      }
    };

    const pool = [...queue];
    const workers = Array.from({ length: concurrency }, async () => {
      while (pool.length) {
        const book = pool.shift();
        if (book) await load(book);
      }
    });
    await Promise.all(workers);
  }, []);

  // Initial load: profile, weights, saved, swipes, first candidate batch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [swipes, savedList, learned] = await Promise.all([
        loadSwipes(),
        loadSaved(),
        loadWeights(),
      ]);
      if (cancelled) return;

      setSaved(savedList);
      setLikedKeys(swipes.filter((s) => s.direction === "like").map((s) => s.book_key));
      weightsRef.current = learned;

      const profile = resolveTasteProfile(learned);
      profileRef.current = profile;

      const exclude = new Set<string>(buildLibraryExclusionSet());
      for (const s of swipes) exclude.add(s.book_key);
      excludeRef.current = exclude;

      const first = await generateCandidates(profile, exclude, 30);
      if (cancelled) return;

      setQueue(first);
      setLoading(false);

      // Hydrate baked + cached shelf covers immediately.
      const baked = allLibraryCoverEntries();
      const registry = loadRegistry();
      const hydrated = new Map<string, string | null>();
      for (const [key, url] of Object.entries(baked)) hydrated.set(key, url);
      for (const [key, row] of Object.entries(registry)) {
        if (row.coverUrl) hydrated.set(key, row.coverUrl);
      }
      if (hydrated.size) {
        setCovers((prev) => {
          const next = new Map(prev);
          for (const [key, url] of hydrated) {
            if (!next.has(key)) next.set(key, url);
          }
          return next;
        });
        for (const key of hydrated.keys()) {
          if (hydrated.get(key)) coversRef.current.add(key);
        }
      }

      void ensureCovers(first.slice(0, 10), first[0]?.key);
      void ensureCovers(wantToReadBooks());
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureCovers]);

  // Keep the cover window warm as the active card moves.
  useEffect(() => {
    if (!queue.length) return;
    const window = queue.slice(Math.max(0, activeIndex - 1), activeIndex + 6);
    void ensureCovers(window, queue[activeIndex]?.key);
  }, [queue, activeIndex, ensureCovers]);

  // Fetch more candidates when running low.
  useEffect(() => {
    if (loading || fetchingMore.current) return;
    if (queue.length - activeIndex > REFRESH_THRESHOLD) return;
    const profile = profileRef.current;
    if (!profile) return;

    fetchingMore.current = true;
    (async () => {
      const more = await generateCandidates(profile, excludeRef.current, 20);
      setQueue((prev) => {
        const existing = new Set(prev.map((b) => b.key));
        return [...prev, ...more.filter((b) => !existing.has(b.key))];
      });
      fetchingMore.current = false;
    })();
  }, [queue.length, activeIndex, loading]);

  const clearUndoTimer = () => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
  };

  const advance = useCallback(() => {
    setActiveIndex((i) => i + 1);
  }, []);

  const handleAction = useCallback(
    (action: SwipeAction) => {
      const book = queue[activeIndex];
      if (!book) return;

      if (action === "skip") {
        advance();
        return;
      }

      const direction: SwipeDirection = action === "like" ? "like" : "pass";
      void recordSwipe(book.key, direction);
      excludeRef.current.add(book.key);

      const delta = learnFromSwipe(
        book,
        direction,
        categoriesRef.current.get(book.key) ?? book.categories
      );
      const merged = mergeWeights(weightsRef.current, delta);
      weightsRef.current = merged;
      void saveWeights(merged);

      if (direction === "like") setLikedKeys((k) => [...k, book.key]);

      // Set up undo (reverse = negated delta).
      clearUndoTimer();
      setUndo({
        book,
        direction,
        reverseWeights: delta.map((d) => ({ ...d, weight: -d.weight })),
      });
      undoTimer.current = window.setTimeout(() => setUndo(null), 5000);

      advance();
    },
    [queue, activeIndex, advance]
  );

  const handleUndo = useCallback(() => {
    if (!undo) return;
    clearUndoTimer();
    void removeSwipe(undo.book.key);
    excludeRef.current.delete(undo.book.key);
    if (undo.direction === "like") {
      setLikedKeys((k) => k.filter((key) => key !== undo.book.key));
    }
    const merged = mergeWeights(weightsRef.current, undo.reverseWeights);
    weightsRef.current = merged;
    void saveWeights(merged);
    setActiveIndex((i) => Math.max(0, i - 1));
    setUndo(null);
  }, [undo]);

  const handleToggleSave = useCallback(
    (book: Book) => {
      if (savedKeys.has(book.key)) {
        void unsaveBook(book.key);
        setSaved((prev) => prev.filter((s) => s.book_key !== book.key));
      } else {
        const cover = covers.get(book.key) ?? null;
        void saveBook(book, cover, book.goodreadsUrl);
        setSaved((prev) => [
          {
            book_key: book.key,
            title: book.title,
            author: book.author,
            cover_url: cover,
            buy_url: book.goodreadsUrl,
            saved_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    },
    [savedKeys, covers]
  );

  // Resolve a Book for a liked key from the library or local registry.
  const likedItems: ShelfItem[] = useMemo(() => {
    const registry = loadRegistry();
    const items: ShelfItem[] = [];
    for (const key of likedKeys) {
      const reg = registry[key];
      if (reg) {
        items.push({ book: reg, coverUrl: reg.coverUrl });
      }
    }
    return items.reverse();
  }, [likedKeys]);

  const savedItems: ShelfItem[] = useMemo(
    () =>
      saved.map((s) => ({
        book: savedToBook(s),
        coverUrl: s.cover_url ?? covers.get(s.book_key) ?? null,
      })),
    [saved, covers]
  );

  const wantItems: ShelfItem[] = useMemo(
    () => wantToReadBooks().map((b) => ({ book: b, coverUrl: covers.get(b.key) ?? null })),
    [covers]
  );

  // Ensure covers for shelf views that need them.
  useEffect(() => {
    if (view === "want-to-read") void ensureCovers(wantToReadBooks());
  }, [view, ensureCovers]);

  const activeBook = queue[activeIndex];
  const exhausted = !loading && (queue.length === 0 || activeIndex >= queue.length);
  const { isMobile } = useViewport();
  const hideNav = isMobile && !!detailBook;

  return (
    <PasscodeGate>
      <div className="relative h-full w-full overflow-hidden bg-warm">
        <AnimatePresence>
          {!entered && <WelcomeScreen key="welcome" onEnter={() => setEntered(true)} />}
        </AnimatePresence>

        {entered && (
          <>
            <NavBar
              view={view}
              onChange={(next) => {
                setDetailBook(null);
                setView(next);
              }}
              savedCount={saved.length}
              likedCount={likedKeys.length}
              hidden={hideNav}
            />

            <main className="h-full min-h-0 w-full">
              {view === "discover" && (
                <>
                  {loading ? (
                    <CarouselSkeleton />
                  ) : exhausted ? (
                    <EmptyState
                      icon={<Sparkles size={30} />}
                      title="You've seen them all"
                      message="You've been through every recommendation for now. Check your Want to Read shelf, or come back soon for fresh picks."
                      action={{
                        label: "Browse Want to Read",
                        onClick: () => setView("want-to-read"),
                      }}
                    />
                  ) : (
                    <CoverflowCarousel
                      books={queue}
                      activeIndex={activeIndex}
                      covers={covers}
                      savedKeys={savedKeys}
                      onBrowse={setActiveIndex}
                      onAction={handleAction}
                      onToggleSave={handleToggleSave}
                      onOpenDetail={setDetailBook}
                    />
                  )}
                </>
              )}

              {view === "saved" &&
                (savedItems.length ? (
                  <Shelf
                    title="Saved"
                    subtitle={`${savedItems.length} book${savedItems.length === 1 ? "" : "s"} bookmarked for later`}
                    items={savedItems}
                    onOpen={setDetailBook}
                    onRemove={(b) => handleToggleSave(b)}
                    removeLabel="Remove from saved"
                  />
                ) : (
                  <EmptyState
                    icon={<Bookmark size={30} />}
                    title="Nothing saved yet"
                    message="Tap the heart on any book to bookmark it here for later."
                    action={{ label: "Discover books", onClick: () => setView("discover") }}
                  />
                ))}

              {view === "liked" &&
                (likedItems.length ? (
                  <Shelf
                    title="Loved"
                    subtitle={`${likedItems.length} book${likedItems.length === 1 ? "" : "s"} you swiped right on`}
                    items={likedItems}
                    onOpen={setDetailBook}
                  />
                ) : (
                  <EmptyState
                    icon={<Heart size={30} />}
                    title="No loves yet"
                    message="Swipe right on books you'd read. They'll gather here and teach the recommendations what you like."
                    action={{ label: "Start swiping", onClick: () => setView("discover") }}
                  />
                ))}

              {view === "want-to-read" &&
                (wantItems.length ? (
                  <Shelf
                    title="Want to Read"
                    subtitle={`${wantItems.length} books from your Goodreads shelf`}
                    items={wantItems}
                    onOpen={setDetailBook}
                  />
                ) : (
                  <EmptyState
                    icon={<BookMarked size={30} />}
                    title="Your Want to Read shelf is empty"
                    message="Books you marked 'Want to Read' on Goodreads will show up here."
                  />
                ))}
            </main>
          </>
        )}

        {/* Detail overlay */}
        <AnimatePresence>
          {detailBook && (
            <BookDetail
              key={detailBook.key}
              book={detailBook}
              saved={savedKeys.has(detailBook.key)}
              onToggleSave={() => handleToggleSave(detailBook)}
              showActions={
                view === "discover" && !!activeBook && detailBook.key === activeBook.key
              }
              onAction={handleAction}
              onClose={() => setDetailBook(null)}
            />
          )}
        </AnimatePresence>

        {/* Undo toast */}
        <AnimatePresence>
          {undo && (
            <UndoToast
              direction={undo.direction}
              title={undo.book.title}
              onUndo={handleUndo}
            />
          )}
        </AnimatePresence>
      </div>
    </PasscodeGate>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeWeights(base: TasteWeight[], delta: TasteWeight[]): TasteWeight[] {
  const map = new Map<string, TasteWeight>();
  for (const w of base) map.set(`${w.feature_type}:${w.feature_value}`, { ...w });
  for (const d of delta) {
    const k = `${d.feature_type}:${d.feature_value}`;
    const existing = map.get(k);
    if (existing) existing.weight += d.weight;
    else map.set(k, { ...d });
  }
  return [...map.values()];
}
