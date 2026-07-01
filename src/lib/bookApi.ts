/**
 * Book metadata + discovery from Hardcover, Open Library, and Google Books.
 *
 * Covers load via a fast race (first high-quality URL wins). Full metadata
 * loads lazily for detail views. Price / buy links from Google Books.
 */
import type { Book, BookMeta } from "../types";
import { getCachedMeta, patchCachedCover, setCachedMeta } from "./cache";
import {
  fetchHardcoverCoverUrl,
  fetchHardcoverMeta,
  searchByAuthor as hcByAuthor,
  searchByAuthorAndSubject as hcByAuthorSubject,
  searchBySubject as hcBySubject,
} from "./hardcover";
import {
  fetchOpenLibraryCoverUrl,
  fetchOpenLibraryMeta,
  searchByAuthor as olByAuthor,
  searchBySubject as olBySubject,
} from "./openLibrary";

const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";

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

async function fetchGoogleVolume(book: Book): Promise<GoogleVolume | null> {
  const query = book.isbn13
    ? `isbn:${book.isbn13}`
    : `intitle:${book.title} inauthor:${book.author}`;
  const url = googleBooksUrl({ q: query, maxResults: 1, country: "US" });
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items?.[0] as GoogleVolume) ?? null;
  } catch {
    return null;
  }
}

async function fetchGoogleCoverUrl(book: Book): Promise<string | null> {
  const vol = await fetchGoogleVolume(book);
  return bestGoogleCover(vol?.volumeInfo?.imageLinks);
}

/** First source to return a URL wins — no pre-validation downloads. */
function raceCoverSources(book: Book): Promise<string | null> {
  const sources = [
    () => fetchHardcoverCoverUrl(book),
    () => fetchOpenLibraryCoverUrl(book),
    () => fetchGoogleCoverUrl(book),
  ];

  return new Promise((resolve) => {
    let remaining = sources.length;
    let settled = false;

    const finish = (url: string | null) => {
      if (settled) return;
      if (url) {
        settled = true;
        resolve(url);
        return;
      }
      remaining -= 1;
      if (remaining === 0) resolve(null);
    };

    for (const source of sources) {
      source().then(finish).catch(() => finish(null));
    }
  });
}

/**
 * Fast cover-only fetch for the carousel. Uses cache → seed URL → parallel race.
 */
export async function fetchCoverUrl(book: Book): Promise<string | null> {
  const cached = await getCachedMeta(book.key);
  if (cached?.coverUrl) return cached.coverUrl;
  const url = book.seedCoverUrl ?? (await raceCoverSources(book));
  if (url) void patchCachedCover(book.key, url);
  return url;
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
        averageRating: existing.averageRating ?? book.averageRating,
        categories: mergeCategories(existing.categories, book.categories),
        seedCoverUrl: existing.seedCoverUrl ?? book.seedCoverUrl,
      });
    }
  }
  return [...byKey.values()];
}

function pickCoverUrl(
  book: Book,
  hc: Awaited<ReturnType<typeof fetchHardcoverMeta>>,
  ol: Awaited<ReturnType<typeof fetchOpenLibraryMeta>>,
  vol: GoogleVolume | null
): string | null {
  return (
    book.seedCoverUrl ??
    hc?.coverUrl ??
    ol.coverUrl ??
    bestGoogleCover(vol?.volumeInfo?.imageLinks) ??
    null
  );
}

export async function fetchBookMeta(book: Book): Promise<BookMeta> {
  const cached = await getCachedMeta(book.key);
  if (cached) return cached;

  const [hc, ol, vol] = await Promise.all([
    fetchHardcoverMeta(book),
    fetchOpenLibraryMeta(book),
    fetchGoogleVolume(book),
  ]);
  const info = vol?.volumeInfo;

  const meta: BookMeta = {
    coverUrl: pickCoverUrl(book, hc, ol, vol),
    description: hc?.description ?? ol.description ?? info?.description?.replace(/<[^>]+>/g, "").trim() ?? null,
    categories: mergeCategories(hc?.categories, ol.categories, info?.categories, book.categories),
    price: vol ? formatPrice(vol) : null,
    buyUrl: vol?.saleInfo?.buyLink ?? bookshopSearch(book),
    pageCount: hc?.pageCount ?? ol.pageCount ?? info?.pageCount ?? null,
    publishedDate: hc?.publishedDate ?? ol.publishedDate ?? info?.publishedDate ?? null,
    previewLink: ol.previewLink ?? cleanGoogleThumb(info?.previewLink) ?? null,
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
  };
}

async function googleSearch(query: string, maxResults = 20): Promise<Book[]> {
  const url = googleBooksUrl({
    q: query,
    maxResults,
    orderBy: "relevance",
    printType: "books",
    country: "US",
  });
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const items = (data.items ?? []) as GoogleSearchVolume[];
    return items.map(volumeToBook).filter((b): b is Book => b !== null);
  } catch {
    return [];
  }
}

async function mergedSearch(fetchers: (() => Promise<Book[]>)[]): Promise<Book[]> {
  const results = await Promise.all(fetchers.map((fn) => fn().catch(() => [] as Book[])));
  return mergeBooks(...results);
}

export function searchByAuthor(author: string): Promise<Book[]> {
  return mergedSearch([
    () => hcByAuthor(author),
    () => olByAuthor(author),
    () => googleSearch(`inauthor:"${author}"`, 20),
  ]);
}

export function searchBySubject(subject: string): Promise<Book[]> {
  return mergedSearch([
    () => hcBySubject(subject),
    () => olBySubject(subject),
    () => googleSearch(`subject:"${subject}"`, 20),
  ]);
}

export function searchByAuthorAndSubject(author: string, subject: string): Promise<Book[]> {
  return mergedSearch([
    () => hcByAuthorSubject(author, subject),
    () => googleSearch(`inauthor:"${author}" subject:"${subject}"`, 15),
  ]);
}

/** Load covers for a batch; optionally upgrade with a higher-res race winner. */
export async function prefetchCovers(books: Book[], concurrency = 8): Promise<void> {
  const queue = [...books];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const book = queue.shift();
      if (!book) break;
      const url = book.seedCoverUrl ?? (await fetchCoverUrl(book));
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
