/**
 * Content-based recommender with online feedback.
 *
 * 1. Seeds a "taste profile" (author + genre weights) from Romi's Goodreads
 *    library, weighted by her star ratings and personal shelf tags.
 * 2. Generates a candidate pool she hasn't read (want-to-read seeds, more by
 *    her favorite authors, and books in her strongest genres).
 * 3. Scores + ranks candidates against the taste profile.
 * 4. Learns online: each like/pass nudges the relevant author/genre weights.
 */
import type { Book, LibraryBook, SwipeDirection, TasteWeight } from "../types";
import libraryData from "../data/library.json";
import { searchByAuthor, searchBySubject } from "./bookApi";

const library = libraryData as unknown as LibraryBook[];

/** Map shelf tags to broad genre/subject terms Google Books understands. */
const TAG_TO_SUBJECT: Record<string, string> = {
  romance: "Romance",
  "rom-coms": "Romantic comedy",
  lgbtq: "LGBT",
  booktok: "Fiction",
  favorites: "Fiction",
};

export interface TasteProfile {
  authorWeights: Map<string, number>;
  genreWeights: Map<string, number>;
  topAuthors: string[];
  topGenres: string[];
}

/**
 * Books to never recommend: already read, currently reading, or DNF.
 * Want-to-read books are intentionally excluded here because they are surfaced
 * as high-priority *candidates* instead.
 */
export function nonCandidateLibraryKeys(): string[] {
  return library.filter((b) => b.status !== "want-to-read").map((b) => b.key);
}

export function wantToReadBooks(): Book[] {
  return library
    .filter((b) => b.status === "want-to-read")
    .map((b) => ({
      key: b.key,
      title: b.cleanTitle,
      author: b.author,
      series: b.series,
      seriesNumber: b.seriesNumber,
      isbn13: b.isbn13,
      goodreadsUrl: b.goodreadsUrl,
      averageRating: b.averageRating,
      reason: "On your Want to Read shelf",
      fromWantToRead: true,
    }));
}

/** Rating (1-5) -> contribution centered around a neutral 3-star read. */
function ratingWeight(rating: number | null): number {
  if (rating == null) return 0.5; // read but unrated: mild positive
  return rating - 3; // amazing=+2 ... did not like=-2
}

export function buildTasteProfile(): TasteProfile {
  const authorWeights = new Map<string, number>();
  const genreWeights = new Map<string, number>();

  for (const book of library) {
    // DNF applies a negative signal like a low rating; want-to-read is a mild
    // positive intent signal; read uses the star rating.
    let weight: number;
    if (book.status === "did-not-finish") weight = -1.5;
    else if (book.status === "want-to-read") weight = 0.75;
    else weight = ratingWeight(book.rating);

    authorWeights.set(book.author, (authorWeights.get(book.author) ?? 0) + weight);

    for (const tag of book.tags) {
      const subject = TAG_TO_SUBJECT[tag] ?? tag;
      // Favorites shelf is a strong endorsement of the book's genres.
      const tagBoost = tag === "favorites" ? weight + 1 : weight;
      genreWeights.set(subject, (genreWeights.get(subject) ?? 0) + tagBoost);
    }
  }

  const topAuthors = [...authorWeights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([a]) => a);

  const topGenres = [...genreWeights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);

  return { authorWeights, genreWeights, topAuthors, topGenres };
}

/** Merge learned weights (from swipes) into a fresh seed profile. */
export function applyLearnedWeights(profile: TasteProfile, learned: TasteWeight[]): TasteProfile {
  for (const w of learned) {
    const map = w.feature_type === "author" ? profile.authorWeights : profile.genreWeights;
    map.set(w.feature_value, (map.get(w.feature_value) ?? 0) + w.weight);
  }
  return profile;
}

function scoreBook(book: Book, profile: TasteProfile): number {
  let score = 0;

  const authorW = profile.authorWeights.get(book.author);
  if (authorW) score += authorW * 2; // author affinity is a strong signal

  // We don't have candidate genres without another fetch, so use the average
  // Goodreads/Google rating as a light popularity prior.
  if (book.averageRating) score += (book.averageRating - 3.5) * 0.8;

  if (book.fromWantToRead) score += 5; // her own explicit intent ranks first

  return score;
}

const seen = new Set<string>();

/**
 * Generate a scored, de-duplicated candidate queue she hasn't read.
 * `exclude` should include already-read keys plus keys she has swiped on.
 */
export async function generateCandidates(
  profile: TasteProfile,
  exclude: Set<string>,
  limit = 30
): Promise<Book[]> {
  const pool = new Map<string, Book>();

  const add = (book: Book, reason: string) => {
    if (exclude.has(book.key) || pool.has(book.key)) return;
    if (!book.reason) book.reason = reason;
    pool.set(book.key, book);
  };

  // 1. Want-to-read seeds first (highest intent).
  for (const b of wantToReadBooks()) add(b, b.reason ?? "On your Want to Read shelf");

  // 2. More from her favorite authors + strongest genres (fetched in parallel).
  const authorQueries = profile.topAuthors.slice(0, 6).map(async (author) => {
    const results = await searchByAuthor(author);
    for (const b of results) add(b, `Because you love ${author}`);
  });
  const genreQueries = profile.topGenres.slice(0, 3).map(async (genre) => {
    const results = await searchBySubject(genre);
    for (const b of results) add(b, `More ${genre.toLowerCase()} to fall for`);
  });
  await Promise.all([...authorQueries, ...genreQueries]);

  const ranked = [...pool.values()]
    .filter((b) => !seen.has(b.key))
    .map((b) => ({ book: b, score: scoreBook(b, profile) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ book }) => book);

  ranked.forEach((b) => seen.add(b.key));
  return ranked;
}

/** Reset the per-session "already queued" memory (used when resetting passes). */
export function resetSeen(): void {
  seen.clear();
}

/**
 * Learn from a swipe: nudge the author weight (and, if we later fetch genres,
 * the genre weights). Returns the delta records to persist.
 */
export function learnFromSwipe(book: Book, direction: SwipeDirection): TasteWeight[] {
  const delta = direction === "like" ? 1.5 : -1.5;
  return [{ feature_type: "author", feature_value: book.author, weight: delta }];
}

export function libraryBooks(): LibraryBook[] {
  return library;
}
