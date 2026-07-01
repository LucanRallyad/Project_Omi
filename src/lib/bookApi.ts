/**
 * Book metadata + discovery from Hardcover, Open Library, and Google Books.
 *
 * Covers load via a fast race (first high-quality URL wins). Full metadata
 * loads lazily for detail views. Price / buy links from Google Books.
 */
import type { Book, BookMeta } from "../types";
import { firstValidCoverUrl } from "./coverUtils";
import { fetchGoodreadsDescription } from "./goodreads";
import { getCachedMeta, patchCachedCover, setCachedMeta } from "./cache";
import { getLibraryDescription } from "./libraryDescriptions";
import { pickBestDescription } from "./textUtils";
import {
  fetchHardcoverCoverUrl,
  fetchHardcoverMeta,
  searchByAuthor as hcByAuthor,
  searchByAuthorAndSubject as hcByAuthorSubject,
  searchBySeries as hcBySeries,
  searchBySubject as hcBySubject,
  searchByTitle as hcByTitle,
} from "./hardcover";
import { getLibraryCoverUrl } from "./libraryCovers";
import {
  fetchOpenLibraryCoverUrl,
  fetchOpenLibraryMeta,
  isOpenLibraryApiAvailable,
  searchByAuthor as olByAuthor,
  searchByAuthorAndSubject as olByAuthorSubject,
  searchBySeries as olBySeries,
  searchBySubject as olBySubject,
  searchByTitle as olByTitle,
} from "./openLibrary";
import { dedupe, RateLimiter } from "./requestQueue";

const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";

/** Without an API key Google allows ~1k/day; space requests to avoid 429 bursts. */
const googleLimiter = new RateLimiter(
  import.meta.env.VITE_GOOGLE_BOOKS_API_KEY ? 180 : 450
);

const searchCache = new Map<string, { books: Book[]; fetchedAt: number }>();
const SEARCH_TTL_MS = 30 * 60 * 1000;

function googleBooksUrl(params: Record<string, string | number>): string {
  const url = new URL(GOOGLE_BOOKS);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const apiKey = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY;
  if (apiKey) url.searchParams.set("key", apiKey);
  return url.toString();
}

interface GoogleImageLinks {
  thumbnail?: string;
  smallThumbnail?: string;
  small?: string;
  medium?: string;
  large?: string;
  extraLarge?: string;
}

/** Prefer the largest Google Books rendition available. */
function bestGoogleCover(links: GoogleImageLinks | undefined): string | null {
  if (!links) return null;
  const raw =
    links.extraLarge ??
    links.large ??
    links.medium ??
    links.small ??
    links.thumbnail ??
    links.smallThumbnail;
  return cleanGoogleThumb(raw);
}

function cleanGoogleThumb(url: string | undefined): string | null {
  if (!url) return null;
  return url
    .replace(/^http:/, "https:")
    .replace("&edge=curl", "")
    .replace(/zoom=\d+/, "zoom=0");
}

function bookshopSearch(book: Book): string {
  const q = encodeURIComponent(`${book.title} ${book.author}`);
  return `https://bookshop.org/beta-search?keywords=${q}`;
}

function amazonSearch(book: Book): string {
  const q = encodeURIComponent(`${book.title} ${book.author}`);
  return `https://www.amazon.com/s?k=${q}&i=stripbooks`;
}

export function buyLinks(book: Book): { bookshop: string; amazon: string } {
  return { bookshop: bookshopSearch(book), amazon: amazonSearch(book) };
}

interface GoogleVolume {
  volumeInfo?: {
    description?: string;
    categories?: string[];
    pageCount?: number;
    publishedDate?: string;
    previewLink?: string;
    imageLinks?: GoogleImageLinks;
  };
  saleInfo?: {
    listPrice?: { amount?: number; currencyCode?: string };
    retailPrice?: { amount?: number; currencyCode?: string };
    buyLink?: string;
  };
}

function formatPrice(vol: GoogleVolume): string | null {
  const price = vol.saleInfo?.retailPrice ?? vol.saleInfo?.listPrice;
  if (price?.amount == null) return null;
  const currency = price.currencyCode ?? "USD";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(price.amount);
  } catch {
    return `${price.amount} ${currency}`;
  }
}

async function fetchGoogleVolumes(book: Book, maxResults = 3): Promise<GoogleVolume[]> {
  if (googleLimiter.isPaused()) return [];
  const query = book.isbn13
    ? `isbn:${book.isbn13}`
    : `intitle:${book.title} inauthor:${book.author}`;
  const url = googleBooksUrl({ q: query, maxResults, country: "US" });
  try {
    return await googleLimiter.run(async () => {
      const res = await fetch(url);
      if (res.status === 429) {
        googleLimiter.pause();
        return [] as GoogleVolume[];
      }
      if (!res.ok) return [] as GoogleVolume[];
      const data = await res.json();
      return (data.items ?? []) as GoogleVolume[];
    });
  } catch {
    return [];
  }
}

async function fetchGoogleVolume(book: Book): Promise<GoogleVolume | null> {
  const volumes = await fetchGoogleVolumes(book, 3);
  return volumes[0] ?? null;
}

function googleDescriptions(volumes: GoogleVolume[]): string | null {
  return pickBestDescription(...volumes.map((v) => v.volumeInfo?.description));
}

async function fetchGoogleCoverUrl(book: Book): Promise<string | null> {
  const vol = await fetchGoogleVolume(book);
  return bestGoogleCover(vol?.volumeInfo?.imageLinks);
}

/** First source to return a URL wins — skip OL network race when its API is down. */
async function resolveBestCover(book: Book): Promise<string | null> {
  const baked = getLibraryCoverUrl(book.key);
  const [hc, google, ol] = await Promise.all([
    fetchHardcoverCoverUrl(book).catch(() => null),
    fetchGoogleCoverUrl(book).catch(() => null),
    fetchOpenLibraryCoverUrl(book).catch(() => null),
  ]);

  return firstValidCoverUrl([baked, hc, google, ol, book.seedCoverUrl]);
}

/**
 * Fast cover-only fetch for the carousel. Uses cache → parallel lookup → validated
 * best URL, with seed as last-resort fallback.
 */
export async function fetchCoverUrl(book: Book): Promise<string | null> {
  const cached = await getCachedMeta(book.key);
  if (cached?.coverUrl) return cached.coverUrl;

  const best = await resolveBestCover(book);
  if (best) {
    void patchCachedCover(book.key, best);
    return best;
  }
  return book.seedCoverUrl ?? null;
}

function mergeCategories(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const cat of list ?? []) {
      const key = cat.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push(cat);
      }
    }
  }
  return out.slice(0, 8);
}

function mergeBooks(...lists: Book[][]): Book[] {
  const byKey = new Map<string, Book>();
  for (const list of lists) {
    for (const book of list) {
      const existing = byKey.get(book.key);
      if (!existing) {
        byKey.set(book.key, { ...book });
        continue;
      }
      byKey.set(book.key, {
        ...existing,
        series: existing.series ?? book.series,
        seriesNumber: existing.seriesNumber ?? book.seriesNumber,
        isbn13: existing.isbn13 ?? book.isbn13,
        averageRating: existing.averageRating ?? book.averageRating,
        categories: mergeCategories(existing.categories, book.categories),
        seedCoverUrl: existing.seedCoverUrl ?? book.seedCoverUrl,
      });
    }
  }
  return [...byKey.values()];
}

async function pickCoverUrl(
  book: Book,
  hc: Awaited<ReturnType<typeof fetchHardcoverMeta>>,
  ol: Awaited<ReturnType<typeof fetchOpenLibraryMeta>>,
  vol: GoogleVolume | null
): Promise<string | null> {
  return firstValidCoverUrl([
    book.seedCoverUrl,
    hc?.coverUrl,
    bestGoogleCover(vol?.volumeInfo?.imageLinks),
    ol.coverUrl,
  ]);
}

export async function fetchBookMeta(book: Book): Promise<BookMeta> {
  const cached = await getCachedMeta(book.key);
  if (cached?.description) return cached;

  const bakedDescription = getLibraryDescription(book.key);
  const [hc, ol, volumes, grDesc] = await Promise.all([
    fetchHardcoverMeta(book),
    fetchOpenLibraryMeta(book),
    fetchGoogleVolumes(book, 3),
    book.goodreadsUrl ? fetchGoodreadsDescription(book.goodreadsUrl) : Promise.resolve(null),
  ]);
  const vol = volumes[0] ?? null;
  const info = vol?.volumeInfo;

  const description = pickBestDescription(
    bakedDescription,
    hc?.description,
    ol.description,
    googleDescriptions(volumes),
    grDesc
  );

  const meta: BookMeta = {
    coverUrl: cached?.coverUrl ?? (await pickCoverUrl(book, hc, ol, vol)),
    description,
    categories: mergeCategories(cached?.categories, hc?.categories, ol.categories, info?.categories, book.categories),
    price: vol ? formatPrice(vol) : cached?.price ?? null,
    buyUrl: vol?.saleInfo?.buyLink ?? cached?.buyUrl ?? bookshopSearch(book),
    pageCount: hc?.pageCount ?? ol.pageCount ?? info?.pageCount ?? cached?.pageCount ?? null,
    publishedDate: hc?.publishedDate ?? ol.publishedDate ?? info?.publishedDate ?? cached?.publishedDate ?? null,
    previewLink: ol.previewLink ?? cleanGoogleThumb(info?.previewLink) ?? cached?.previewLink ?? null,
  };

  await setCachedMeta(book.key, meta);
  return meta;
}

interface GoogleSearchVolume {
  volumeInfo?: {
    title?: string;
    authors?: string[];
    averageRating?: number;
    industryIdentifiers?: { type: string; identifier: string }[];
    categories?: string[];
    imageLinks?: GoogleImageLinks;
  };
}

function normalizeTitleKey(title: string, author: string): string {
  return `ta:${title.toLowerCase().trim()}|${author.toLowerCase().trim()}`;
}

function volumeToBook(vol: GoogleSearchVolume): Book | null {
  const info = vol.volumeInfo;
  if (!info?.title || !info.authors?.length) return null;
  const isbn13 =
    info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ?? null;
  const author = info.authors[0];
  return {
    key: isbn13 ? `isbn:${isbn13}` : normalizeTitleKey(info.title, author),
    title: info.title,
    author,
    series: null,
    seriesNumber: null,
    isbn13,
    goodreadsUrl: null,
    averageRating: info.averageRating ?? null,
    categories: info.categories ?? [],
    seedCoverUrl: bestGoogleCover(info.imageLinks),
  };
}

async function googleSearch(query: string, maxResults = 20): Promise<Book[]> {
  if (googleLimiter.isPaused()) return [];

  const cacheKey = `g:${query}:${maxResults}`;
  const cached = searchCache.get(cacheKey);
  if (cached && cached.books.length > 0 && Date.now() - cached.fetchedAt < SEARCH_TTL_MS) {
    return cached.books;
  }

  return dedupe(cacheKey, async () => {
    const url = googleBooksUrl({
      q: query,
      maxResults,
      orderBy: "relevance",
      printType: "books",
      country: "US",
    });
    try {
      const books = await googleLimiter.run(async () => {
        const res = await fetch(url);
        if (res.status === 429) {
          googleLimiter.pause();
          return [] as Book[];
        }
        if (!res.ok) return [] as Book[];
        const data = await res.json();
        const items = (data.items ?? []) as GoogleSearchVolume[];
        return items.map(volumeToBook).filter((b): b is Book => b !== null);
      });
      if (books.length > 0) {
        searchCache.set(cacheKey, { books, fetchedAt: Date.now() });
      }
      return books;
    } catch {
      return [];
    }
  });
}

function cachedSearch(key: string, fn: () => Promise<Book[]>): Promise<Book[]> {
  const hit = searchCache.get(key);
  if (hit && hit.books.length > 0 && Date.now() - hit.fetchedAt < SEARCH_TTL_MS) {
    return Promise.resolve(hit.books);
  }
  return dedupe(key, async () => {
    const books = await fn();
    if (books.length > 0) {
      searchCache.set(key, { books, fetchedAt: Date.now() });
    }
    return books;
  });
}

async function mergedSearch(fetchers: (() => Promise<Book[]>)[]): Promise<Book[]> {
  const results = await Promise.all(
    fetchers.map((fn) => fn().catch(() => [] as Book[]))
  );
  return mergeBooks(...results);
}

function olSearchAuthor(author: string): Promise<Book[]> {
  return isOpenLibraryApiAvailable() ? olByAuthor(author) : Promise.resolve([]);
}

function olSearchSubject(subject: string): Promise<Book[]> {
  return isOpenLibraryApiAvailable() ? olBySubject(subject) : Promise.resolve([]);
}

export function searchByAuthor(author: string): Promise<Book[]> {
  return cachedSearch(`author:${author}`, () =>
    mergedSearch([
      () => hcByAuthor(author),
      () => olSearchAuthor(author),
      () => (googleLimiter.isPaused() ? Promise.resolve([]) : googleSearch(`inauthor:"${author}"`, 30)),
    ])
  );
}

export function searchBySubject(subject: string): Promise<Book[]> {
  return cachedSearch(`subject:${subject}`, () =>
    mergedSearch([
      () => hcBySubject(subject),
      () => olSearchSubject(subject),
      () => (googleLimiter.isPaused() ? Promise.resolve([]) : googleSearch(`subject:"${subject}"`, 30)),
    ])
  );
}

export function searchByAuthorAndSubject(author: string, subject: string): Promise<Book[]> {
  return cachedSearch(`author-subject:${author}:${subject}`, () =>
    mergedSearch([
      () => hcByAuthorSubject(author, subject),
      () => (isOpenLibraryApiAvailable() ? olByAuthorSubject(author, subject) : Promise.resolve([])),
      () =>
        googleLimiter.isPaused()
          ? Promise.resolve([])
          : googleSearch(`inauthor:"${author}" subject:"${subject}"`, 25),
    ])
  );
}

export function searchBySeries(series: string): Promise<Book[]> {
  return cachedSearch(`series:${series}`, () =>
    mergedSearch([
      () => hcBySeries(series),
      () => (isOpenLibraryApiAvailable() ? olBySeries(series) : Promise.resolve([])),
      () =>
        googleLimiter.isPaused()
          ? Promise.resolve([])
          : googleSearch(`intitle:"${series}"`, 25),
    ])
  );
}

/** Title lookup — useful for books missing ISBN or cover seeds. */
export function searchByTitle(title: string, author?: string): Promise<Book[]> {
  const cacheKey = `title:${title}:${author ?? ""}`;
  return cachedSearch(cacheKey, () =>
    mergedSearch([
      () => hcByTitle(title, author),
      () => (isOpenLibraryApiAvailable() ? olByTitle(title, author) : Promise.resolve([])),
      () =>
        googleLimiter.isPaused()
          ? Promise.resolve([])
          : googleSearch(
              author ? `intitle:"${title}" inauthor:"${author}"` : `intitle:"${title}"`,
              8
            ),
    ])
  );
}

/** Load covers for a batch; upgrades weak seed URLs when a better source validates. */
export async function prefetchCovers(books: Book[], concurrency = 8): Promise<void> {
  const queue = [...books];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const book = queue.shift();
      if (!book) break;
      const url = await fetchCoverUrl(book);
      await patchCachedCover(book.key, url);
    }
  });
  await Promise.all(workers);
}

export async function prefetchMeta(books: Book[], concurrency = 3): Promise<void> {
  const queue = [...books];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const book = queue.shift();
      if (!book) break;
      await fetchBookMeta(book).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 150));
    }
  });
  await Promise.all(workers);
}
