export type ReadingStatus =
  | "read"
  | "want-to-read"
  | "currently-reading"
  | "did-not-finish";

export type ShelfTag =
  | "favorites"
  | "romance"
  | "rom-coms"
  | "booktok"
  | "lgbtq";

/** A book from Romi's parsed Goodreads library. */
export interface LibraryBook {
  /** Stable identity: isbn13 if available, else normalized title|author. */
  key: string;
  title: string;
  /** Cleaned title without the trailing "(Series, #n)" segment. */
  cleanTitle: string;
  author: string;
  status: ReadingStatus;
  /** 1-5, derived from Goodreads star rating. null if unrated. */
  rating: number | null;
  averageRating: number | null;
  ratingsCount: number | null;
  series: string | null;
  seriesNumber: number | null;
  isbn13: string | null;
  goodreadsUrl: string | null;
  tags: ShelfTag[];
  pages: number | null;
  /** Baked cover URL from scripts/fetchLibraryCovers.ts (optional). */
  coverUrl?: string | null;
  /** Synopsis from Goodreads RSS / sync (optional). */
  description?: string | null;
  /** Goodreads work/edition id for deduping sync rows. */
  goodreadsBookId?: string | null;
  /** ISO timestamp from the last Goodreads RSS sync (Supabase rows only). */
  syncedAt?: string | null;
}

/** A candidate book to recommend (may originate from the library or an API). */
export interface Book {
  /** Stable identity: isbn13 if available, else normalized title|author. */
  key: string;
  title: string;
  author: string;
  series: string | null;
  seriesNumber: number | null;
  isbn13: string | null;
  goodreadsUrl: string | null;
  averageRating: number | null;
  /** Why this book was recommended, shown as a small chip. */
  reason?: string;
  /** True if this came from Romi's Goodreads "Want to Read" shelf. */
  fromWantToRead?: boolean;
  /** Genre tags from API search, used for scoring and taste learning. */
  categories?: string[];
  /** Cover URL from search results — shown instantly while full lookup runs. */
  seedCoverUrl?: string | null;
}

/** Enriched metadata fetched from external APIs. */
export interface BookMeta {
  coverUrl: string | null;
  description: string | null;
  categories: string[];
  price: string | null;
  buyUrl: string;
  pageCount: number | null;
  publishedDate: string | null;
  previewLink: string | null;
}

export type SwipeDirection = "like" | "pass";

export interface SavedBook {
  book_key: string;
  title: string;
  author: string;
  cover_url: string | null;
  buy_url: string | null;
  saved_at: string;
}

export interface TasteWeight {
  feature_type: "author" | "genre";
  feature_value: string;
  weight: number;
}

export type ShelfView = "discover" | "saved" | "liked" | "want-to-read" | "reading-map";
