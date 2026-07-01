/**
 * Merge Goodreads RSS shelves into the app's LibraryBook shape.
 */
import type { LibraryBook, ReadingStatus, ShelfTag } from "../src/types";
import {
  fetchGoodreadsShelf,
  fetchGoodreadsTagBookIds,
  type GoodreadsRssItem,
  type GoodreadsShelf,
  type GoodreadsTagShelf,
} from "./goodreadsRss";

const MAIN_SHELVES: GoodreadsShelf[] = [
  "read",
  "to-read",
  "currently-reading",
  "did-not-finish",
];

const TAG_SHELVES: GoodreadsTagShelf[] = [
  "favorites",
  "romance",
  "rom-coms",
  "booktok",
  "lgbtq",
];

const STATUS_MAP: Record<GoodreadsShelf, ReadingStatus> = {
  read: "read",
  "to-read": "want-to-read",
  "currently-reading": "currently-reading",
  "did-not-finish": "did-not-finish",
};

function clean(str: string): string {
  return str
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthor(raw: string): string {
  const author = clean(raw);
  if (author.includes(",")) {
    const [last, first] = author.split(",").map((s) => s.trim());
    return `${first} ${last}`.trim();
  }
  return author;
}

function extractSeries(title: string): {
  cleanTitle: string;
  series: string | null;
  seriesNumber: number | null;
} {
  const match = title.match(/\s*\(([^()]+?),\s*#([\d.]+)\)\s*$/);
  if (match) {
    return {
      cleanTitle: clean(title.replace(match[0], "")),
      series: clean(match[1]),
      seriesNumber: parseFloat(match[2]),
    };
  }
  return { cleanTitle: clean(title), series: null, seriesNumber: null };
}

function toKey(isbn13: string | null, title: string, author: string): string {
  if (isbn13) return `isbn:${isbn13}`;
  return `ta:${clean(title).toLowerCase()}|${author.toLowerCase()}`;
}

function rssToLibraryBook(item: GoodreadsRssItem, tags: ShelfTag[]): LibraryBook {
  const { cleanTitle, series, seriesNumber } = extractSeries(item.title);
  const author = normalizeAuthor(item.author);
  const status = STATUS_MAP[item.shelf];

  return {
    key: toKey(item.isbn13, cleanTitle, author),
    title: clean(item.title),
    cleanTitle,
    author,
    status,
    rating: item.userRating,
    averageRating: item.averageRating,
    ratingsCount: item.ratingsCount,
    series,
    seriesNumber,
    isbn13: item.isbn13,
    goodreadsUrl: item.goodreadsUrl,
    tags,
    pages: item.pages,
    coverUrl: item.coverUrl,
    description: item.description,
    goodreadsBookId: item.bookId,
  };
}

export interface GoodreadsSyncResult {
  books: LibraryBook[];
  byStatus: Record<string, number>;
  syncedAt: string;
}

/** Pull Romi's full library from Goodreads RSS and merge tag shelves. */
export async function syncGoodreadsLibrary(userId: string): Promise<GoodreadsSyncResult> {
  const byBookId = new Map<string, { item: GoodreadsRssItem; tags: Set<ShelfTag> }>();

  for (const shelf of MAIN_SHELVES) {
    const items = await fetchGoodreadsShelf(userId, shelf);
    for (const item of items) {
      const existing = byBookId.get(item.bookId);
      if (!existing) {
        byBookId.set(item.bookId, { item, tags: new Set() });
      } else if (existing.item.shelf !== item.shelf) {
        // Prefer the most recent shelf assignment (later fetches win on conflict).
        existing.item = item;
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  for (const tag of TAG_SHELVES) {
    const ids = await fetchGoodreadsTagBookIds(userId, tag);
    for (const id of ids) {
      const row = byBookId.get(id);
      if (row) row.tags.add(tag);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const books = [...byBookId.values()].map(({ item, tags }) =>
    rssToLibraryBook(item, [...tags])
  );

  const byStatus = books.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});

  return { books, byStatus, syncedAt: new Date().toISOString() };
}
