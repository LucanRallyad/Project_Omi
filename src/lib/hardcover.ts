/**
 * Hardcover GraphQL client — calls our server-side proxy at /api/hardcover so
 * the API token never reaches the browser.
 */
import type { Book } from "../types";

const PROXY = "/api/hardcover";

export interface HardcoverMeta {
  coverUrl: string | null;
  description: string | null;
  categories: string[];
  pageCount: number | null;
  publishedDate: string | null;
}

interface HcImage {
  url?: string;
}

interface HcSearchDocument {
  title?: string;
  author_names?: string[];
  isbns?: string[];
  genres?: string[];
  moods?: string[];
  tags?: string[];
  image?: HcImage;
  rating?: number;
  description?: string;
  compilation?: boolean;
  pages?: number;
  release_year?: number;
  featured_series?: {
    position?: number;
    series?: { name?: string };
  };
}

interface HcSearchResults {
  hits?: { document?: HcSearchDocument }[];
}

interface HcEdition {
  pages?: number;
  release_date?: string;
  image?: HcImage;
  book?: {
    title?: string;
    rating?: number;
    description?: string;
    image?: HcImage;
    contributions?: { author?: { name?: string } }[];
    book_series?: { series?: { name?: string }; position?: number }[];
  };
}

async function hardcoverQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T | null> {
  try {
    const res = await fetch(PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors?.length) return null;
    return json.data ?? null;
  } catch {
    return null;
  }
}

function pickIsbn13(isbns: string[] | undefined): string | null {
  if (!isbns?.length) return null;
  return isbns.find((i) => /^\d{13}$/.test(i)) ?? null;
}

function normalizeTitleKey(title: string, author: string): string {
  return `ta:${title.toLowerCase().trim()}|${author.toLowerCase().trim()}`;
}

function categoriesFromDoc(doc: HcSearchDocument): string[] {
  const raw = [...(doc.genres ?? []), ...(doc.moods ?? []), ...(doc.tags ?? [])];
  return [...new Set(raw.map((s) => s.trim()).filter(Boolean))].slice(0, 8);
}

function docToBook(doc: HcSearchDocument): Book | null {
  if (!doc.title || doc.compilation) return null;
  const author = doc.author_names?.[0];
  if (!author) return null;

  const isbn13 = pickIsbn13(doc.isbns);
  const categories = categoriesFromDoc(doc);

  return {
    key: isbn13 ? `isbn:${isbn13}` : normalizeTitleKey(doc.title, author),
    title: doc.title,
    author,
    series: doc.featured_series?.series?.name ?? null,
    seriesNumber: doc.featured_series?.position ?? null,
    isbn13,
    goodreadsUrl: null,
    averageRating: doc.rating ?? null,
    categories,
    seedCoverUrl: doc.image?.url ?? null,
  };
}

function parseSearchHits(results: unknown): HcSearchDocument[] {
  const typed = results as HcSearchResults | undefined;
  return (typed?.hits ?? [])
    .map((h) => h.document)
    .filter((d): d is HcSearchDocument => Boolean(d?.title));
}

const SEARCH_BOOKS = `
  query SearchBooks($query: String!, $perPage: Int!, $sort: String) {
    search(query: $query, query_type: "Book", per_page: $perPage, page: 1, sort: $sort) {
      results
    }
  }
`;

async function searchBooks(query: string, perPage = 30): Promise<Book[]> {
  const data = await hardcoverQuery<{ search?: { results?: unknown } }>(SEARCH_BOOKS, {
    query,
    perPage,
    sort: "users_count:desc",
  });
  return parseSearchHits(data?.search?.results)
    .map(docToBook)
    .filter((b): b is Book => b !== null);
}

export function searchByAuthor(author: string): Promise<Book[]> {
  return searchBooks(author, 30).then((books) =>
    books.filter((b) => b.author.toLowerCase().includes(author.toLowerCase().split(" ")[0] ?? author))
  );
}

export function searchBySubject(subject: string): Promise<Book[]> {
  return searchBooks(subject, 25).then((books) =>
    books.filter((b) =>
      b.categories?.some((c) => c.toLowerCase().includes(subject.toLowerCase()))
    )
  );
}

export function searchByAuthorAndSubject(author: string, subject: string): Promise<Book[]> {
  return searchBooks(`${author} ${subject}`, 25).then((books) =>
    books.filter(
      (b) =>
        b.author.toLowerCase().includes(author.toLowerCase().split(" ")[0] ?? author) &&
        b.categories?.some((c) => c.toLowerCase().includes(subject.toLowerCase()))
    )
  );
}

export function searchBySeries(series: string): Promise<Book[]> {
  return searchBooks(series, 25).then((books) =>
    books.filter(
      (b) =>
        b.series?.toLowerCase().includes(series.toLowerCase()) ||
        b.title.toLowerCase().includes(series.toLowerCase())
    )
  );
}

export function searchByTitle(title: string, author?: string): Promise<Book[]> {
  const query = author ? `${title} ${author}` : title;
  return searchBooks(query, 8).then((books) => {
    const titleKey = title.toLowerCase().trim();
    const authorKey = author?.toLowerCase().trim();
    return books.filter((b) => {
      const matchesTitle =
        b.title.toLowerCase().includes(titleKey) || titleKey.includes(b.title.toLowerCase());
      if (!authorKey) return matchesTitle;
      return (
        matchesTitle &&
        b.author.toLowerCase().includes(authorKey.split(" ")[0] ?? authorKey)
      );
    });
  });
}

const EDITION_BY_ISBN13 = `
  query EditionByIsbn13($isbn: String!) {
    editions(where: { isbn_13: { _eq: $isbn } }, limit: 1) {
      pages
      release_date
      image { url }
      book {
        title
        rating
        description
        image { url }
        contributions { author { name } }
      }
    }
  }
`;

const EDITION_BY_ISBN10 = `
  query EditionByIsbn10($isbn: String!) {
    editions(where: { isbn_10: { _eq: $isbn } }, limit: 1) {
      pages
      release_date
      image { url }
      book {
        title
        rating
        description
        image { url }
        contributions { author { name } }
      }
    }
  }
`;

const SEARCH_BY_TITLE = `
  query SearchByTitle($query: String!) {
    search(query: $query, query_type: "Book", per_page: 5, page: 1, sort: "users_count:desc") {
      results
    }
  }
`;

function editionToMeta(edition: HcEdition): HardcoverMeta | null {
  const book = edition.book;
  if (!book) return null;

  const coverUrl = edition.image?.url ?? book.image?.url ?? null;
  return {
    coverUrl,
    description: book.description?.trim() ?? null,
    categories: [],
    pageCount: edition.pages ?? null,
    publishedDate: edition.release_date ?? null,
  };
}

function matchSearchDoc(docs: HcSearchDocument[], book: Book): HcSearchDocument | null {
  const titleKey = book.title.toLowerCase().trim();
  const authorKey = book.author.toLowerCase().trim();
  return (
    docs.find(
      (d) =>
        d.title?.toLowerCase().trim() === titleKey &&
        d.author_names?.some((a) => a.toLowerCase().trim() === authorKey)
    ) ??
    docs.find(
      (d) =>
        d.title?.toLowerCase().includes(titleKey) &&
        d.author_names?.some((a) => a.toLowerCase().includes(authorKey.split(" ")[0] ?? authorKey))
    ) ??
    null
  );
}

function searchDocToMeta(doc: HcSearchDocument): HardcoverMeta {
  return {
    coverUrl: doc.image?.url ?? null,
    description: doc.description?.trim() ?? null,
    categories: categoriesFromDoc(doc),
    pageCount: doc.pages ?? null,
    publishedDate: doc.release_year ? String(doc.release_year) : null,
  };
}

/** Cover URL — edition lookup by ISBN, then title search fallback. */
export async function fetchHardcoverCoverUrl(book: Book): Promise<string | null> {
  if (book.isbn13) {
    let data = await hardcoverQuery<{ editions?: HcEdition[] }>(EDITION_BY_ISBN13, {
      isbn: book.isbn13,
    });
    let edition = data?.editions?.[0];
    if (!edition && book.isbn13.startsWith("978")) {
      const isbn10 = book.isbn13.slice(3, 12);
      data = await hardcoverQuery<{ editions?: HcEdition[] }>(EDITION_BY_ISBN10, { isbn: isbn10 });
      edition = data?.editions?.[0];
    }
    if (edition) {
      const url = edition.image?.url ?? edition.book?.image?.url ?? null;
      if (url) return url;
    }
  }

  const query = `${book.title} ${book.author}`;
  const data = await hardcoverQuery<{ search?: { results?: unknown } }>(SEARCH_BY_TITLE, {
    query,
  });
  const doc = matchSearchDoc(parseSearchHits(data?.search?.results), book);
  return doc?.image?.url ?? null;
}

/** Fetch cover + metadata from Hardcover (edition lookup or title search). */
export async function fetchHardcoverMeta(book: Book): Promise<HardcoverMeta | null> {
  if (book.isbn13) {
    let data = await hardcoverQuery<{ editions?: HcEdition[] }>(EDITION_BY_ISBN13, {
      isbn: book.isbn13,
    });
    let edition = data?.editions?.[0];
    if (!edition && book.isbn13.startsWith("978")) {
      const isbn10 = book.isbn13.slice(3, 12);
      data = await hardcoverQuery<{ editions?: HcEdition[] }>(EDITION_BY_ISBN10, { isbn: isbn10 });
      edition = data?.editions?.[0];
    }
    if (edition) {
      const meta = editionToMeta(edition);
      if (meta?.coverUrl) return meta;
    }
  }

  const query = `${book.title} ${book.author}`;
  const data = await hardcoverQuery<{ search?: { results?: unknown } }>(SEARCH_BY_TITLE, {
    query,
  });
  const doc = matchSearchDoc(parseSearchHits(data?.search?.results), book);
  return doc ? searchDocToMeta(doc) : null;
}
