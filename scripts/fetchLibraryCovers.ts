/**
 * Fetch cover URLs for library books (especially Want to Read) and write
 * src/data/library-covers.json for instant shelf rendering.
 *
 * Run: npm run fetch-covers
 * Requires HARDCOVER_API_TOKEN and optionally VITE_GOOGLE_BOOKS_API_KEY in .env
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeHardcoverGraphQL } from "../lib/hardcoverProxy.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIBRARY = resolve(ROOT, "src/data/library.json");
const OUT = resolve(ROOT, "src/data/library-covers.json");

interface LibraryRow {
  key: string;
  cleanTitle: string;
  author: string;
  status: string;
  isbn13: string | null;
  goodreadsUrl: string | null;
}

function loadEnvFile(): void {
  for (const name of [".env", ".env.local"]) {
    try {
      const raw = readFileSync(resolve(ROOT, name), "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    } catch {
      // optional file
    }
  }
}

async function probeImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-2048" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok && res.status !== 206) return false;
    const type = res.headers.get("content-type") ?? "";
    return type.startsWith("image/");
  } catch {
    return false;
  }
}

function trustedCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (
    url.includes("hardcover.app") ||
    url.includes("googleusercontent.com") ||
    url.includes("gr-assets.com") ||
    url.includes("media-amazon.com")
  )
    return url;
  return null;
}

async function firstWorkingUrl(urls: (string | null | undefined)[]): Promise<string | null> {
  const seen = new Set<string>();
  for (const raw of urls) {
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    const trusted = trustedCoverUrl(raw);
    if (trusted) return trusted;
    if (await probeImageUrl(raw)) return raw;
  }
  return null;
}

const EDITION_BY_ISBN13 = `
  query EditionByIsbn13($isbn: String!) {
    editions(where: { isbn_13: { _eq: $isbn } }, limit: 1) {
      image { url }
      book { image { url } }
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

interface HcHit {
  document?: {
    title?: string;
    author_names?: string[];
    image?: { url?: string };
  };
}

async function hardcoverCover(
  token: string,
  title: string,
  author: string,
  isbn13: string | null
): Promise<string | null> {
  if (isbn13) {
    const data = await executeHardcoverGraphQL(EDITION_BY_ISBN13, { isbn: isbn13 }, token);
    const edition = (data.data as { editions?: { image?: { url?: string }; book?: { image?: { url?: string } } }[] })
      ?.editions?.[0];
    const url = edition?.image?.url ?? edition?.book?.image?.url ?? null;
    if (url) return url;
  }

  const data = await executeHardcoverGraphQL(SEARCH_BY_TITLE, { query: `${title} ${author}` }, token);
  const hits =
    ((data.data as { search?: { results?: { hits?: HcHit[] } } })?.search?.results?.hits) ?? [];
  const titleKey = title.toLowerCase().trim();
  const authorKey = author.toLowerCase().trim();
  for (const hit of hits) {
    const doc = hit.document;
    if (!doc?.title || !doc.author_names?.length) continue;
    const matchesTitle = doc.title.toLowerCase().includes(titleKey) || titleKey.includes(doc.title.toLowerCase());
    const matchesAuthor = doc.author_names.some((a) =>
      a.toLowerCase().includes(authorKey.split(" ")[0] ?? authorKey)
    );
    if (matchesTitle && matchesAuthor && doc.image?.url) return doc.image.url;
  }
  return null;
}

async function googleCover(title: string, author: string, isbn13: string | null, apiKey: string): Promise<string | null> {
  const q = isbn13
    ? `isbn:${isbn13}`
    : `intitle:"${title}" inauthor:"${author}"`;
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("country", "US");
  if (apiKey) url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { volumeInfo?: { imageLinks?: Record<string, string> } }[];
    };
    const links = data.items?.[0]?.volumeInfo?.imageLinks;
    if (!links) return null;
    const raw =
      links.extraLarge ?? links.large ?? links.medium ?? links.thumbnail ?? links.smallThumbnail;
    if (!raw) return null;
    return raw.replace(/^http:/, "https:").replace("&edge=curl", "").replace(/zoom=\d+/, "zoom=0");
  } catch {
    return null;
  }
}

async function openLibraryCover(title: string, author: string, isbn13: string | null): Promise<string | null> {
  const fields = "title,author_name,isbn,cover_i";
  const trySearch = async (params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, limit: "3", fields });
    const res = await fetch(`https://openlibrary.org/search.json?${qs}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      docs?: { cover_i?: number; title?: string; author_name?: string[] }[];
    };
    return data.docs?.[0] ?? null;
  };

  let doc = isbn13 ? await trySearch({ isbn: isbn13 }) : null;
  if (!doc) doc = await trySearch({ title, author });
  if (doc?.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`;
  if (isbn13) return `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg?default=false`;
  return null;
}

/** Scrape og:image from the Goodreads page — reliable when ISBN lookups miss. */
async function goodreadsOgCover(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BooksForRomi/1.0; +https://project-omi.vercel.app)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m =
      html.match(/property="og:image"\s+content="([^"]+)"/) ??
      html.match(/content="([^"]+)"\s+property="og:image"/);
    const url = m?.[1]?.replace(/&amp;/g, "&") ?? null;
    return url?.includes("gr-assets.com") || url?.includes("media-amazon.com") ? url : null;
  } catch {
    return null;
  }
}

async function fetchCoverForBook(
  book: LibraryRow,
  hcToken: string | null,
  googleKey: string | null
): Promise<string | null> {
  const [hc, google, ol, gr] = await Promise.all([
    hcToken ? hardcoverCover(hcToken, book.cleanTitle, book.author, book.isbn13) : Promise.resolve(null),
    googleKey ? googleCover(book.cleanTitle, book.author, book.isbn13, googleKey) : Promise.resolve(null),
    openLibraryCover(book.cleanTitle, book.author, book.isbn13),
    book.goodreadsUrl ? goodreadsOgCover(book.goodreadsUrl) : Promise.resolve(null),
  ]);

  return firstWorkingUrl([hc, google, ol, gr]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvFile();
  const hcToken = process.env.HARDCOVER_API_TOKEN ?? null;
  const googleKey = process.env.VITE_GOOGLE_BOOKS_API_KEY ?? null;

  if (!hcToken) {
    console.warn("Warning: HARDCOVER_API_TOKEN not set — Hardcover covers will be skipped.");
  }

  const library = JSON.parse(readFileSync(LIBRARY, "utf8")) as LibraryRow[];
  let existing: Record<string, string> = {};
  try {
    existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, string>;
  } catch {
    // fresh run
  }

  const targets = library.filter((b) => b.status === "want-to-read");
  const covers: Record<string, string> = { ...existing };
  let found = 0;
  let missed = 0;

  console.log(`Fetching covers for ${targets.length} Want to Read books…`);

  for (const book of targets) {
    if (covers[book.key] && (await probeImageUrl(covers[book.key]))) {
      found += 1;
      process.stdout.write(".");
      continue;
    }

    const url = await fetchCoverForBook(book, hcToken, googleKey);
    if (url) {
      covers[book.key] = url;
      found += 1;
      process.stdout.write("+");
    } else {
      delete covers[book.key];
      missed += 1;
      process.stdout.write("x");
    }
    await sleep(120);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(covers, null, 2), "utf8");

  console.log(`\nDone: ${found}/${targets.length} covers saved -> ${OUT}`);
  if (missed) console.log(`${missed} still missing — re-run after checking API keys.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
