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
  if (authorW) score += authorW * 2;

  if (book.averageRating) score += (book.averageRating - 3.5) * 0.8;

  if (book.categories?.length) {
    for (const cat of book.categories) {
      const genreW = profile.genreWeights.get(cat);
      if (genreW) score += genreW * 1.2;
    }
  }

  return score;
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
  const cacheKey = `candidates:${limit}:${exclude.size}:${profile.topAuthors.slice(0, 4).join("|")}`;

  return dedupe(cacheKey, async () => {
    const pool = new Map<string, Book>();

    const add = (book: Book, reason: string) => {
      if (isExcludedBook(book, exclude, libraryExclude) || pool.has(book.key)) return;
      if (!book.reason) book.reason = reason;
      pool.set(book.key, book);
    };

    const rank = () =>
      [...pool.values()]
        .filter((b) => !seen.has(b.key))
        .map((b) => ({ book: b, score: scoreBook(b, profile) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ book }) => book);

    const authorTasks = profile.topAuthors.slice(0, 6).map(
      (author) => async () => {
        const results = await searchByAuthor(author);
        for (const b of results) add(b, `Because you love ${author}`);
      }
    );
    const genreTasks = profile.topGenres.slice(0, 4).map(
      (genre) => async () => {
        const results = await searchBySubject(genre);
        for (const b of results) add(b, `More ${genre.toLowerCase()} to fall for`);
      }
    );
    const crossTasks = profile.topAuthors.slice(0, 3).flatMap((author) =>
      profile.topGenres.slice(0, 2).map(
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
    const seriesTasks = [...lovedSeries].slice(0, 4).map(
      (series) => async () => {
        const results = await searchBySeries(series);
        for (const b of results) add(b, `More from ${series}`);
      }
    );

    await Promise.race([
      runPool([...authorTasks, ...genreTasks, ...crossTasks, ...seriesTasks], 3, 80),
      sleep(8000),
    ]);

    const ranked = rank();
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
  const delta = direction === "like" ? 1.5 : -1.5;
  const weights: TasteWeight[] = [
    { feature_type: "author", feature_value: book.author, weight: delta },
  ];
  const genres = categories.length ? categories : (book.categories ?? []);
  for (const genre of genres.slice(0, 3)) {
    weights.push({ feature_type: "genre", feature_value: genre, weight: delta * 0.8 });
  }
  return weights;
}
