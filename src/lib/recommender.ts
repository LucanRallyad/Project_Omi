/**
 * Content-based recommender with online feedback.
 *
 * 1. Seeds a "taste profile" (author + genre weights) from Romi's Goodreads
 *    library, weighted by her star ratings and personal shelf tags.
 * 2. Generates a candidate pool of *new* books via API search (favorite authors,
 *    genres, and loved series) — never re-surfaces her read shelf.
 * 3. Scores + ranks candidates against the taste profile.
 * 4. Learns online: each like/pass nudges the relevant author/genre weights.
 */
import type { Book, SwipeDirection, TasteWeight } from "../types";
import { canonicalGenre, genreScoreForCategories } from "./genreMatch";
import {
  buildTasteProfile,
  buildLibraryExclusionSet,
  isExcludedBook,
  libraryBooks,
  nonCandidateLibraryKeys,
  profileFromWeights,
  resolveTasteProfile,
  tasteWeightsFromProfile,
  wantToReadBookFromLibrary,
  wantToReadLibraryBooks,
  type TasteProfile,
} from "./libraryProfile";
import { searchByAuthor, searchByAuthorAndSubject, searchBySeries, searchBySubject } from "./bookApi";
import { dedupe, runPool, sleep } from "./requestQueue";

export {
  buildTasteProfile,
  buildLibraryExclusionSet,
  libraryBooks,
  nonCandidateLibraryKeys,
  profileFromWeights,
  resolveTasteProfile,
  tasteWeightsFromProfile,
  type TasteProfile,
};

export function wantToReadBooks(): Book[] {
  return wantToReadLibraryBooks().map(wantToReadBookFromLibrary);
}

function scoreBook(book: Book, profile: TasteProfile): number {
  let score = 0;

  const authorW = profile.authorWeights.get(book.author);
  if (authorW != null) {
    score += authorW * (authorW < 0 ? 2.5 : 2);
  }

  if (book.averageRating) {
    score += (book.averageRating - 3.5) * 0.9;
    if (book.averageRating >= 4.2) score += 0.4;
  }

  const categories = book.categories ?? [];
  score += genreScoreForCategories(categories, profile.genreWeights);

  if (book.series) score += 0.35;

  return score;
}

/** Pick top-scoring books with at most two titles per author for variety. */
function rankWithDiversity(
  pool: Map<string, Book>,
  profile: TasteProfile,
  seenKeys: Set<string>,
  limit: number
): Book[] {
  const scored = [...pool.values()]
    .filter((b) => !seenKeys.has(b.key))
    .map((book) => ({ book, score: scoreBook(book, profile) }))
    .sort((a, b) => b.score - a.score);

  const picked: Book[] = [];
  const authorCounts = new Map<string, number>();

  for (const { book } of scored) {
    const count = authorCounts.get(book.author) ?? 0;
    if (count >= 2) continue;
    picked.push(book);
    authorCounts.set(book.author, count + 1);
    if (picked.length >= limit) break;
  }

  if (picked.length < limit) {
    for (const { book } of scored) {
      if (picked.some((p) => p.key === book.key)) continue;
      picked.push(book);
      if (picked.length >= limit) break;
    }
  }

  return picked;
}

const seen = new Set<string>();

/**
 * Generate a scored, de-duplicated queue of *new* books she hasn't read.
 * Want-to-read titles are excluded here — they have their own shelf.
 */
export async function generateCandidates(
  profile: TasteProfile,
  exclude: Set<string>,
  limit = 30
): Promise<Book[]> {
  const libraryExclude = buildLibraryExclusionSet();
  const cacheKey = `candidates:${limit}:${exclude.size}:${profile.topAuthors.slice(0, 5).join("|")}`;

  return dedupe(cacheKey, async () => {
    const pool = new Map<string, Book>();

    const add = (book: Book, reason: string) => {
      if (isExcludedBook(book, exclude, libraryExclude) || pool.has(book.key)) return;
      if (!book.reason) book.reason = reason;
      pool.set(book.key, book);
    };

    const fiveStarAuthors = new Set<string>();
    for (const book of libraryBooks()) {
      if (book.rating === 5) fiveStarAuthors.add(book.author);
    }

    const authorTasks = profile.topAuthors.slice(0, 8).map(
      (author) => async () => {
        const results = await searchByAuthor(author);
        for (const b of results) add(b, `Because you love ${author}`);
      }
    );
    const starAuthorTasks = [...fiveStarAuthors]
      .filter((a) => !profile.topAuthors.slice(0, 8).includes(a))
      .slice(0, 4)
      .map(
        (author) => async () => {
          const results = await searchByAuthor(author);
          for (const b of results) add(b, `More from ${author}`);
        }
      );
    const genreTasks = profile.topGenres.slice(0, 5).map(
      (genre) => async () => {
        const results = await searchBySubject(genre);
        for (const b of results) add(b, `More ${genre.toLowerCase()} to fall for`);
      }
    );
    const crossTasks = profile.topAuthors.slice(0, 4).flatMap((author) =>
      profile.topGenres.slice(0, 3).map(
        (genre) => async () => {
          const results = await searchByAuthorAndSubject(author, genre);
          for (const b of results) add(b, `${author} × ${genre.toLowerCase()}`);
        }
      )
    );

    const lovedSeries = new Set<string>();
    for (const book of libraryBooks()) {
      if (
        book.series &&
        (book.status === "read" || book.status === "want-to-read") &&
        (book.rating ?? book.averageRating ?? 0) >= 4
      ) {
        lovedSeries.add(book.series);
      }
    }
    const seriesTasks = [...lovedSeries].slice(0, 6).map(
      (series) => async () => {
        const results = await searchBySeries(series);
        for (const b of results) add(b, `More from ${series}`);
      }
    );

    await Promise.race([
      runPool(
        [...authorTasks, ...starAuthorTasks, ...genreTasks, ...crossTasks, ...seriesTasks],
        4,
        80
      ),
      sleep(12000),
    ]);

    const ranked = rankWithDiversity(pool, profile, seen, limit);
    ranked.forEach((b) => seen.add(b.key));
    return ranked;
  });
}

/** Reset the per-session "already queued" memory (used when resetting passes). */
export function resetSeen(): void {
  seen.clear();
}

/**
 * Learn from a swipe: nudge the author weight and any known genre weights.
 * Returns the delta records to persist.
 */
export function learnFromSwipe(
  book: Book,
  direction: SwipeDirection,
  categories: string[] = []
): TasteWeight[] {
  const delta = direction === "like" ? 2 : -2.25;
  const weights: TasteWeight[] = [
    { feature_type: "author", feature_value: book.author, weight: delta },
  ];
  const genres = categories.length ? categories : (book.categories ?? []);
  const canonical = [...new Set(genres.map(canonicalGenre))];
  for (const genre of canonical.slice(0, 4)) {
    weights.push({ feature_type: "genre", feature_value: genre, weight: delta * 0.85 });
  }
  return weights;
}
