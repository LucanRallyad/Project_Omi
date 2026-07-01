/**
 * Taste profile and exclusion rules derived from Romi's parsed Goodreads library.
 * Kept separate from API/search code so CLI seed scripts can import it in Node.
 */
import type { Book, LibraryBook, TasteWeight } from "../types";
import libraryData from "../data/library.json";

const library = libraryData as unknown as LibraryBook[];

/** Map shelf tags to broad genre/subject terms book APIs understand. */
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

export function wantToReadLibraryBooks(): LibraryBook[] {
  return library.filter((b) => b.status === "want-to-read");
}

/** Rating (1-5) -> contribution centered around a neutral 3-star read. */
function ratingWeight(rating: number | null): number {
  if (rating == null) return 0.5;
  return rating - 3;
}

export function buildTasteProfile(): TasteProfile {
  const authorWeights = new Map<string, number>();
  const genreWeights = new Map<string, number>();

  for (const book of library) {
    let weight: number;
    if (book.status === "did-not-finish") weight = -1.5;
    else if (book.status === "want-to-read") weight = 0.75;
    else weight = ratingWeight(book.rating);

    authorWeights.set(book.author, (authorWeights.get(book.author) ?? 0) + weight);

    for (const tag of book.tags) {
      const subject = TAG_TO_SUBJECT[tag] ?? tag;
      const tagBoost = tag === "favorites" ? weight + 1 : weight;
      genreWeights.set(subject, (genreWeights.get(subject) ?? 0) + tagBoost);
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

export function resolveTasteProfile(learned: TasteWeight[]): TasteProfile {
  if (learned.length) return profileFromWeights(learned);
  return buildTasteProfile();
}

export function libraryBooks(): LibraryBook[] {
  return library;
}

/** Map a want-to-read library row to a discover-queue Book (without cover URL). */
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
