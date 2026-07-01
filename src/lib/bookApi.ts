/**
 * Fetches book metadata (cover, description, genres, price, buy link) from free
 * public APIs, with graceful degradation and caching.
 *
 * - Covers: Open Library Covers API (by ISBN), Google Books thumbnail fallback.
 * - Descriptions / genres / price: Google Books volumes API.
 * - Buy links: Google Books buy link if for sale, else a Bookshop.org search.
 */
import type { Book, BookMeta } from "../types";
import { getCachedMeta, setCachedMeta } from "./cache";

const GOOGLE_BOOKS = "https://www.googleapis.com/books/v1/volumes";

/** Upgrade Google Books thumbnails to https + a slightly larger, crisper image. */
function cleanGoogleThumb(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^http:/, "https:").replace("&edge=curl", "");
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
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
  };
  saleInfo?: {
    saleability?: string;
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
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(price.amount);
  } catch {
    return `${price.amount} ${currency}`;
  }
}

async function fetchGoogleVolume(book: Book): Promise<GoogleVolume | null> {
  const query = book.isbn13
    ? `isbn:${book.isbn13}`
    : `intitle:${book.title} inauthor:${book.author}`;
  const url = `${GOOGLE_BOOKS}?q=${encodeURIComponent(query)}&maxResults=1&country=US`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items?.[0] as GoogleVolume) ?? null;
  } catch {
    return null;
  }
}

/** Open Library returns a 404 (not a placeholder) when default=false is set. */
function openLibraryCover(isbn13: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`;
}

/**
 * Check a cover exists by actually loading the image. This avoids CORS issues
 * that a HEAD fetch would hit, since <img> loads are not CORS-restricted.
 */
function coverExists(url: string): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => resolve(false), 6000);
    img.onload = () => {
      clearTimeout(timer);
      // A real cover is wider than the 1px OL placeholder.
      resolve(img.naturalWidth > 2);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

export async function fetchBookMeta(book: Book): Promise<BookMeta> {
  const cached = await getCachedMeta(book.key);
  if (cached) return cached;

  const vol = await fetchGoogleVolume(book);
  const info = vol?.volumeInfo;

  let coverUrl: string | null = null;
  if (book.isbn13) {
    const olUrl = openLibraryCover(book.isbn13);
    if (await coverExists(olUrl)) coverUrl = olUrl;
  }
  if (!coverUrl) {
    coverUrl = cleanGoogleThumb(info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail);
  }

  const meta: BookMeta = {
    coverUrl,
    description: info?.description?.replace(/<[^>]+>/g, "").trim() ?? null,
    categories: info?.categories ?? [],
    price: vol ? formatPrice(vol) : null,
    buyUrl: vol?.saleInfo?.buyLink ?? bookshopSearch(book),
    pageCount: info?.pageCount ?? null,
    publishedDate: info?.publishedDate ?? null,
    previewLink: cleanGoogleThumb(info?.previewLink) ?? null,
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
  };
}

async function googleSearch(query: string, maxResults = 20): Promise<Book[]> {
  const url = `${GOOGLE_BOOKS}?q=${encodeURIComponent(
    query
  )}&maxResults=${maxResults}&orderBy=relevance&printType=books&country=US`;
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

export function searchByAuthor(author: string): Promise<Book[]> {
  return googleSearch(`inauthor:"${author}"`, 20);
}

export function searchBySubject(subject: string): Promise<Book[]> {
  return googleSearch(`subject:"${subject}"`, 20);
}

/** Concurrency-limited batch prefetch so we don't overwhelm the APIs. */
export async function prefetchMeta(books: Book[], concurrency = 3): Promise<void> {
  const queue = [...books];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const book = queue.shift();
      if (!book) break;
      await fetchBookMeta(book).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await Promise.all(workers);
}
