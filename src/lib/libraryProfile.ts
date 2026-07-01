/**
 * Taste profile and exclusion rules derived from Romi's parsed Goodreads library.
 * Kept separate from API/search code so CLI seed scripts can import it in Node.
 */
import type { Book, LibraryBook, TasteWeight } from "../types";
import { getLibrary } from "./libraryStore.js";

/** Map shelf tags to broad genre/subject terms book APIs understand. */
const TAG_TO_SUBJECT: Record<string, string> = {
  romance: "Romance",
  "rom-coms": "Romantic comedy",
  lgbtq: "LGBT",
  booktok: "Fiction",
  favorites: "Fiction",
};

/** Series-name hints for genre inference when shelf tags are missing. */
const SERIES_GENRE_HINTS: { pattern: RegExp; genres: string[] }[] = [
  { pattern: /court of thorns|acotar|throne of glass|fourth wing|empyrean/i, genres: ["Fantasy", "Romance"] },
  { pattern: /naturals|thriller|murder|killer|detective/i, genres: ["Thriller", "Young Adult"] },
  { pattern: /hunger games|divergent|maze runner/i, genres: ["Young Adult", "Fiction"] },
];

export interface TasteProfile {
  authorWeights: Map<string, number>;
  genreWeights: Map<string, number>;
  topAuthors: string[];
  topGenres: string[];
}

/**
 * Books to never recommend: already read, currently reading, or DNF.
 * Want-to-read books live on their own shelf — not in Discover.
 */
export function nonCandidateLibraryKeys(): string[] {
  return [...buildLibraryExclusionSet()];
}

function cleanText(str: string): string {
  return str
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip trailing "(Series Name, #3)" so API titles match library cleanTitle keys. */
function stripSeriesSuffix(title: string): string {
  return cleanText(title.replace(/\s*\([^()]+?,\s*#[\d.]+\)\s*$/i, ""));
}

/** Every identity alias we use to recognize the same book across library + APIs. */
export function bookIdentityKeys(book: {
  key?: string;
  title: string;
  author: string;
  isbn13?: string | null;
}): string[] {
  const author = cleanText(book.author).toLowerCase();
  const fullTitle = cleanText(book.title).toLowerCase();
  const shortTitle = stripSeriesSuffix(book.title).toLowerCase();
  const keys = new Set<string>();
  if (book.key) keys.add(book.key);
  keys.add(`ta:${fullTitle}|${author}`);
  if (shortTitle !== fullTitle) keys.add(`ta:${shortTitle}|${author}`);
  if (book.isbn13) {
    keys.add(`isbn:${book.isbn13}`);
    keys.add(book.isbn13);
  }
  return [...keys];
}

/** All keys/aliases for read, currently-reading, and DNF library rows. */
export function buildLibraryExclusionSet(): Set<string> {
  const set = new Set<string>();
  for (const book of getLibrary()) {
    if (book.status === "want-to-read") continue;
    for (const key of bookIdentityKeys({
      key: book.key,
      title: book.cleanTitle,
      author: book.author,
      isbn13: book.isbn13,
    })) {
      set.add(key);
    }
    if (book.title !== book.cleanTitle) {
      for (const key of bookIdentityKeys({
        title: book.title,
        author: book.author,
        isbn13: book.isbn13,
      })) {
        set.add(key);
      }
    }
  }
  return set;
}

export function isExcludedBook(
  book: { key: string; title: string; author: string; isbn13?: string | null },
  exclude: Set<string>,
  libraryExclude = buildLibraryExclusionSet()
): boolean {
  for (const key of bookIdentityKeys(book)) {
    if (exclude.has(key) || libraryExclude.has(key)) return true;
  }
  return false;
}

export function wantToReadLibraryBooks(): LibraryBook[] {
  return getLibrary().filter((b) => b.status === "want-to-read");
}

/** Rating (1-5) -> contribution centered around a neutral 3-star read. */
function ratingWeight(rating: number | null): number {
  if (rating == null) return 0.5;
  if (rating <= 2) return rating - 3.5;
  return rating - 3;
}

/** Library JSON is newest-first; recent reads count slightly more. */
function recencyMultiplier(index: number): number {
  if (index < 25) return 1.25;
  if (index < 70) return 1.1;
  return 1;
}

function inferGenresFromBook(book: LibraryBook): string[] {
  const inferred = new Set<string>();
  const haystack = `${book.title} ${book.series ?? ""}`;
  for (const { pattern, genres } of SERIES_GENRE_HINTS) {
    if (pattern.test(haystack)) genres.forEach((g) => inferred.add(g));
  }
  if (book.series && (book.rating ?? 0) >= 4) inferred.add("Romance");
  return [...inferred];
}

export function buildTasteProfile(): TasteProfile {
  const authorWeights = new Map<string, number>();
  const genreWeights = new Map<string, number>();

  for (const [index, book] of getLibrary().entries()) {
    let weight: number;
    if (book.status === "did-not-finish") weight = -2;
    else if (book.status === "want-to-read") weight = 0.85;
    else weight = ratingWeight(book.rating);

    weight *= recencyMultiplier(index);
    if (book.status === "read" && book.rating === 5) weight *= 1.15;

    authorWeights.set(book.author, (authorWeights.get(book.author) ?? 0) + weight);

    for (const tag of book.tags) {
      const subject = TAG_TO_SUBJECT[tag] ?? tag;
      const tagBoost = tag === "favorites" ? weight + 1.25 : weight;
      genreWeights.set(subject, (genreWeights.get(subject) ?? 0) + tagBoost);
    }

    for (const genre of inferGenresFromBook(book)) {
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight * 0.6);
    }
  }

  const topAuthors = [...authorWeights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([a]) => a);

  const topGenres = [...genreWeights.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([g]) => g);

  return { authorWeights, genreWeights, topAuthors, topGenres };
}

export function tasteWeightsFromProfile(profile: TasteProfile): TasteWeight[] {
  const weights: TasteWeight[] = [];
  for (const [feature_value, weight] of profile.authorWeights) {
    weights.push({ feature_type: "author", feature_value, weight });
  }
  for (const [feature_value, weight] of profile.genreWeights) {
    weights.push({ feature_type: "genre", feature_value, weight });
  }
  return weights;
}

export function profileFromWeights(weights: TasteWeight[]): TasteProfile {
  const authorWeights = new Map<string, number>();
  const genreWeights = new Map<string, number>();

  for (const w of weights) {
    const map = w.feature_type === "author" ? authorWeights : genreWeights;
    map.set(w.feature_value, (map.get(w.feature_value) ?? 0) + w.weight);
  }

  const topAuthors = [...authorWeights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([author]) => author);

  const topGenres = [...genreWeights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre);

  return { authorWeights, genreWeights, topAuthors, topGenres };
}

/** Merge swipe-learned deltas onto the live Goodreads library baseline. */
export function resolveTasteProfile(swipeDeltas: TasteWeight[]): TasteProfile {
  const libraryBaseline = buildTasteProfile();
  if (!swipeDeltas.length) return libraryBaseline;
  return applyLearnedWeights(libraryBaseline, swipeDeltas);
}

/** Merge swipe-learned deltas onto a library baseline profile. */
export function applyLearnedWeights(profile: TasteProfile, learned: TasteWeight[]): TasteProfile {
  const next = profileFromWeights(tasteWeightsFromProfile(profile));
  for (const w of learned) {
    const map = w.feature_type === "author" ? next.authorWeights : next.genreWeights;
    map.set(w.feature_value, (map.get(w.feature_value) ?? 0) + w.weight);
  }
  next.topAuthors = [...next.authorWeights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([author]) => author);
  next.topGenres = [...next.genreWeights.entries()]
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([genre]) => genre);
  return next;
}

export function libraryBooks(): LibraryBook[] {
  return getLibrary();
}

/** Map a want-to-read library row to a discover-queue Book. */
export function wantToReadBookFromLibrary(b: LibraryBook): Book {
  return {
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
  };
}
