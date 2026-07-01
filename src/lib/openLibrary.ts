/**
 * Open Library public API client.
 *
 * - Search: /search.json (author, subject, title, ISBN)
 * - Editions: /api/books (jscmd=details)
 * - Works: /works/{id}.json (descriptions)
 * - Covers: covers.openlibrary.org (CDN — often works when the API host does not)
 */
import type { Book } from "../types";

const OPEN_LIBRARY = "https://openlibrary.org";
const OL_SEARCH = `${OPEN_LIBRARY}/search.json`;
const OL_BOOKS = `${OPEN_LIBRARY}/api/books`;

const SEARCH_FIELDS =
  "key,title,author_name,isbn,first_publish_year,ratings_average,ratings_count,cover_i,subject";

/** After a connection failure, skip API calls for this long (covers CDN still used). */
const OL_DOWN_MS = 10 * 60 * 1000;
let olDownUntil = 0;

export function isOpenLibraryApiAvailable(): boolean {
  return Date.now() >= olDownUntil;
}

function markOpenLibraryDown(): void {
  olDownUntil = Date.now() + OL_DOWN_MS;
}

export interface OpenLibraryMeta {
  coverUrl: string | null;
  description: string | null;
  categories: string[];
  pageCount: number | null;
  publishedDate: string | null;
  previewLink: string | null;
}

interface OlSearchDoc {
  key?: string;
  title?: string;
  author_name?: string[];
  isbn?: string[];
  first_publish_year?: number;
  ratings_average?: number;
  ratings_count?: number;
  cover_i?: number;
  subject?: string[];
}

interface OlEditionDetails {
  preview_url?: string;
  details?: {
    number_of_pages?: number;
    publish_date?: string;
    covers?: number[];
    subjects?: ({ name: string } | string)[];
    works?: { key: string }[];
  };
}

interface OlWork {
  description?: string | { type?: string; value?: string };
  subjects?: string[];
  first_publish_date?: string;
}

function pickIsbn13(isbns: string[] | undefined): string | null {
  if (!isbns?.length) return null;
  return isbns.find((i) => /^\d{13}$/.test(i)) ?? null;
}

function normalizeTitleKey(title: string, author: string): string {
  return `ta:${title.toLowerCase().trim()}|${author.toLowerCase().trim()}`;
}

function cleanSubjects(subjects: string[]): string[] {
  return subjects.filter((s) => !s.startsWith("collectionid:")).slice(0, 8);
}

function parseDescription(raw: OlWork["description"]): string | null {
  if (!raw) return null;
  const text = typeof raw === "string" ? raw : raw.value;
  if (!text) return null;
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/\s*\[[^\]]+\]\([^)]+\)\s*$/g, "")
    .trim();
}

function coverUrlFromId(coverId: number): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`;
}

function subjectsFromEdition(details: OlEditionDetails["details"]): string[] {
  if (!details?.subjects?.length) return [];
  return cleanSubjects(
    details.subjects.map((s) => (typeof s === "string" ? s : s.name))
  );
}

async function olFetch<T>(url: string): Promise<T | null> {
  if (!isOpenLibraryApiAvailable()) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    markOpenLibraryDown();
    return null;
  }
}

function olDocToBook(doc: OlSearchDoc): Book | null {
  if (!doc.title || !doc.author_name?.length) return null;
  const author = doc.author_name[0];
  const isbn13 = pickIsbn13(doc.isbn);
  return {
    key: isbn13 ? `isbn:${isbn13}` : normalizeTitleKey(doc.title, author),
    title: doc.title,
    author,
    series: null,
    seriesNumber: null,
    isbn13,
    goodreadsUrl: null,
    averageRating: doc.ratings_average ?? null,
    categories: cleanSubjects(doc.subject ?? []),
    seedCoverUrl: doc.cover_i ? coverUrlFromId(doc.cover_i) : null,
  };
}

async function openLibrarySearch(
  params: Record<string, string>,
  limit = 20
): Promise<Book[]> {
  if (!isOpenLibraryApiAvailable()) return [];
  const qs = new URLSearchParams({
    ...params,
    limit: String(limit),
    fields: SEARCH_FIELDS,
  });
  const data = await olFetch<{ docs?: OlSearchDoc[] }>(`${OL_SEARCH}?${qs}`);
  if (!data?.docs?.length) return [];
  return data.docs.map(olDocToBook).filter((b): b is Book => b !== null);
}

export function searchByAuthor(author: string): Promise<Book[]> {
  return openLibrarySearch({ author });
}

export function searchBySubject(subject: string): Promise<Book[]> {
  return openLibrarySearch({ subject });
}

async function fetchEditionByIsbn(isbn: string): Promise<OlEditionDetails | null> {
  const url = `${OL_BOOKS}?bibkeys=ISBN:${encodeURIComponent(
    isbn
  )}&format=json&jscmd=details`;
  const data = await olFetch<Record<string, OlEditionDetails>>(url);
  if (!data) return null;
  return data[`ISBN:${isbn}`] ?? null;
}

async function findSearchDoc(book: Book): Promise<OlSearchDoc | null> {
  if (!isOpenLibraryApiAvailable()) return null;

  if (book.isbn13) {
    const data = await olFetch<{ docs?: OlSearchDoc[] }>(
      `${OL_SEARCH}?isbn=${encodeURIComponent(book.isbn13)}&limit=1&fields=${SEARCH_FIELDS}`
    );
    if (data?.docs?.[0]) return data.docs[0];
  }

  const qs = new URLSearchParams({
    title: book.title,
    author: book.author,
    limit: "1",
    fields: SEARCH_FIELDS,
  });
  const data = await olFetch<{ docs?: OlSearchDoc[] }>(`${OL_SEARCH}?${qs}`);
  return data?.docs?.[0] ?? null;
}

async function fetchWork(workKey: string): Promise<OlWork | null> {
  return olFetch<OlWork>(`${OPEN_LIBRARY}${workKey}.json`);
}

export function openLibraryIsbnCover(isbn13: string): string {
  return `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`;
}

/** Fast cover lookup — ISBN CDN URL only; no search API unless needed. */
export async function fetchOpenLibraryCoverUrl(book: Book): Promise<string | null> {
  if (book.seedCoverUrl) return book.seedCoverUrl;
  if (book.isbn13) return openLibraryIsbnCover(book.isbn13);
  if (!isOpenLibraryApiAvailable()) return null;

  const doc = await findSearchDoc(book);
  if (doc?.cover_i) return coverUrlFromId(doc.cover_i);
  return null;
}

async function resolveCoverUrl(
  edition: OlEditionDetails | null,
  searchDoc: OlSearchDoc | null,
  isbn13: string | null
): Promise<string | null> {
  const coverId = edition?.details?.covers?.[0] ?? searchDoc?.cover_i;
  if (coverId) return coverUrlFromId(coverId);
  if (isbn13) return openLibraryIsbnCover(isbn13);
  return null;
}

/** Fetch rich metadata from Open Library (search, editions, works, covers). */
export async function fetchOpenLibraryMeta(book: Book): Promise<OpenLibraryMeta> {
  if (!isOpenLibraryApiAvailable()) {
    return {
      coverUrl: book.isbn13 ? openLibraryIsbnCover(book.isbn13) : null,
      description: null,
      categories: [],
      pageCount: null,
      publishedDate: null,
      previewLink: null,
    };
  }

  const searchDoc = await findSearchDoc(book);
  const isbn13 = book.isbn13 ?? pickIsbn13(searchDoc?.isbn);

  let edition: OlEditionDetails | null = null;
  if (isbn13) edition = await fetchEditionByIsbn(isbn13);

  const workKey =
    edition?.details?.works?.[0]?.key ?? searchDoc?.key ?? null;
  const work = workKey ? await fetchWork(workKey) : null;

  const coverUrl = await resolveCoverUrl(edition, searchDoc, isbn13);
  const editionSubjects = subjectsFromEdition(edition?.details);
  const categories =
    editionSubjects.length > 0
      ? editionSubjects
      : cleanSubjects(work?.subjects ?? searchDoc?.subject ?? []);

  const publishedDate =
    edition?.details?.publish_date ??
    (searchDoc?.first_publish_year ? String(searchDoc.first_publish_year) : null) ??
    work?.first_publish_date ??
    null;

  return {
    coverUrl,
    description: parseDescription(work?.description),
    categories,
    pageCount: edition?.details?.number_of_pages ?? null,
    publishedDate,
    previewLink: edition?.preview_url ?? null,
  };
}
