/**
 * Fetch descriptions for Want to Read library books and write
 * src/data/library-descriptions.json for instant detail views.
 *
 * Run: npm run fetch-descriptions
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { executeHardcoverGraphQL } from "../lib/hardcoverProxy.js";
import { fetchGoodreadsDescription } from "../lib/goodreadsScrape.js";
import { pickBestDescription } from "../src/lib/textUtils.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIBRARY = resolve(ROOT, "src/data/library.json");
const OUT = resolve(ROOT, "src/data/library-descriptions.json");

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
      // optional
    }
  }
}

const SEARCH_BY_TITLE = `
  query SearchByTitle($query: String!) {
    search(query: $query, query_type: "Book", per_page: 3, page: 1, sort: "users_count:desc") {
      results
    }
  }
`;

const EDITION_BY_ISBN13 = `
  query EditionByIsbn13($isbn: String!) {
    editions(where: { isbn_13: { _eq: $isbn } }, limit: 1) {
      book { description }
    }
  }
`;

async function hardcoverDescription(
  token: string,
  title: string,
  author: string,
  isbn13: string | null
): Promise<string | null> {
  if (isbn13) {
    const data = await executeHardcoverGraphQL(EDITION_BY_ISBN13, { isbn: isbn13 }, token);
    const desc = (
      data.data as { editions?: { book?: { description?: string } }[] } | undefined
    )?.editions?.[0]?.book?.description;
    if (desc?.trim()) return desc.trim();
  }

  const data = await executeHardcoverGraphQL(SEARCH_BY_TITLE, { query: `${title} ${author}` }, token);
  const hits =
    (data.data as { search?: { results?: { hits?: { document?: { title?: string; author_names?: string[]; description?: string } }[] } } })
      ?.search?.results?.hits ?? [];
  const titleKey = title.toLowerCase();
  const authorKey = author.toLowerCase();
  for (const hit of hits) {
    const doc = hit.document;
    if (!doc?.description) continue;
    const matchesTitle = doc.title?.toLowerCase().includes(titleKey);
    const matchesAuthor = doc.author_names?.some((a) =>
      a.toLowerCase().includes(authorKey.split(" ")[0] ?? authorKey)
    );
    if (matchesTitle && matchesAuthor) return doc.description.trim();
  }
  return null;
}

async function googleDescription(
  title: string,
  author: string,
  isbn13: string | null,
  apiKey: string
): Promise<string | null> {
  const q = isbn13 ? `isbn:${isbn13}` : `intitle:"${title}" inauthor:"${author}"`;
  const url = new URL("https://www.googleapis.com/books/v1/volumes");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "3");
  url.searchParams.set("country", "US");
  if (apiKey) url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { volumeInfo?: { description?: string } }[];
    };
    return pickBestDescription(...(data.items?.map((i) => i.volumeInfo?.description) ?? []));
  } catch {
    return null;
  }
}

async function openLibraryDescription(
  title: string,
  author: string,
  isbn13: string | null
): Promise<string | null> {
  const fields = "title,author_name,isbn,first_sentence";
  const trySearch = async (params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, limit: "1", fields });
    const res = await fetch(`https://openlibrary.org/search.json?${qs}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      docs?: { key?: string; first_sentence?: string[] }[];
    };
    return data.docs?.[0] ?? null;
  };

  let doc = isbn13 ? await trySearch({ isbn: isbn13 }) : null;
  if (!doc) doc = await trySearch({ title, author });
  if (!doc?.key) return doc?.first_sentence?.[0] ?? null;

  try {
    const workRes = await fetch(`https://openlibrary.org${doc.key}.json`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!workRes.ok) return doc.first_sentence?.[0] ?? null;
    const work = (await workRes.json()) as {
      description?: string | { value?: string };
      first_sentence?: string[];
    };
    const raw =
      typeof work.description === "string"
        ? work.description
        : work.description?.value ?? doc.first_sentence?.[0] ?? work.first_sentence?.[0];
    return raw ?? null;
  } catch {
    return doc.first_sentence?.[0] ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvFile();
  const hcToken = process.env.HARDCOVER_API_TOKEN ?? null;
  const googleKey = process.env.VITE_GOOGLE_BOOKS_API_KEY ?? null;

  const library = JSON.parse(readFileSync(LIBRARY, "utf8")) as LibraryRow[];
  const targets = library.filter((b) => b.status === "want-to-read");

  let existing: Record<string, string> = {};
  try {
    existing = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, string>;
  } catch {
    // fresh
  }

  const descriptions: Record<string, string> = { ...existing };
  let found = 0;

  console.log(`Fetching descriptions for ${targets.length} Want to Read books…`);

  for (const book of targets) {
    const cached = descriptions[book.key];
    if (cached && cached.length > 80) {
      found += 1;
      process.stdout.write(".");
      continue;
    }

    const [hc, google, ol, gr] = await Promise.all([
      hcToken ? hardcoverDescription(hcToken, book.cleanTitle, book.author, book.isbn13) : null,
      googleKey ? googleDescription(book.cleanTitle, book.author, book.isbn13, googleKey) : null,
      openLibraryDescription(book.cleanTitle, book.author, book.isbn13),
      book.goodreadsUrl ? fetchGoodreadsDescription(book.goodreadsUrl) : null,
    ]);

    const best = pickBestDescription(hc, google, ol, gr);
    if (best) {
      descriptions[book.key] = best;
      found += 1;
      process.stdout.write("+");
    } else {
      delete descriptions[book.key];
      process.stdout.write("x");
    }
    await sleep(150);
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(descriptions, null, 2), "utf8");
  console.log(`\nDone: ${found}/${targets.length} descriptions -> ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
