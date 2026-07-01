/**
 * Parses Romi's Goodreads markdown export into a clean JSON dataset the app
 * consumes at build time. Run with: npm run parse-library
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SOURCE = resolve(ROOT, "Romi_Goodreads_Library.md");
const OUT = resolve(ROOT, "src/data/library.json");

type ReadingStatus =
  | "read"
  | "want-to-read"
  | "currently-reading"
  | "did-not-finish";

const RATING_MAP: Record<string, number> = {
  "did not like it": 1,
  "it was ok": 2,
  "liked it": 3,
  "really liked it": 4,
  "it was amazing": 5,
};

const STATUS_MAP: Record<string, ReadingStatus> = {
  Read: "read",
  "Want to Read": "want-to-read",
  "Currently Reading": "currently-reading",
  "Did Not Finish": "did-not-finish",
};

/** Strip zero-width and other invisible characters that appear in some titles. */
function clean(str: string): string {
  return str
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Maas, Sarah J." -> "Sarah J. Maas" */
function normalizeAuthor(raw: string): string {
  const author = clean(raw);
  if (author.includes(",")) {
    const [last, first] = author.split(",").map((s) => s.trim());
    return `${first} ${last}`.trim();
  }
  return author;
}

/** Extract "(Series Name, #3)" from a title, returning parts. */
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

function field(block: string, label: string): string | null {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`);
  const m = block.match(re);
  return m ? clean(m[1]) : null;
}

function toKey(isbn13: string | null, title: string, author: string): string {
  if (isbn13) return `isbn:${isbn13}`;
  return `ta:${clean(title).toLowerCase()}|${author.toLowerCase()}`;
}

function main() {
  const raw = readFileSync(SOURCE, "utf8");
  // Split into per-book blocks on the "### N. Title" headers.
  const blocks = raw.split(/^###\s+\d+\.\s+/m).slice(1);

  const books = blocks.map((block) => {
    const titleLine = block.split("\n")[0];
    const { cleanTitle, series, seriesNumber } = extractSeries(titleLine);

    const authorRaw = field(block, "Author") ?? "Unknown";
    const author = normalizeAuthor(authorRaw);

    const statusRaw = field(block, "Status") ?? "Read";
    const status = STATUS_MAP[statusRaw] ?? "read";

    const ratingRaw = field(block, "My Rating");
    const rating = ratingRaw ? (RATING_MAP[ratingRaw.toLowerCase()] ?? null) : null;

    const avgRaw = field(block, "Average Goodreads Rating");
    let averageRating: number | null = null;
    let ratingsCount: number | null = null;
    if (avgRaw) {
      const avgMatch = avgRaw.match(/([\d.]+)\s*\(([\d,]+)\s*ratings\)/);
      if (avgMatch) {
        averageRating = parseFloat(avgMatch[1]);
        ratingsCount = parseInt(avgMatch[2].replace(/,/g, ""), 10);
      } else {
        const single = avgRaw.match(/([\d.]+)/);
        if (single) averageRating = parseFloat(single[1]);
      }
    }

    const isbn13 = field(block, "ISBN-13");
    const goodreadsUrl = field(block, "Goodreads Link");

    const pagesRaw = field(block, "Pages");
    const pages = pagesRaw ? parseInt(pagesRaw.replace(/\D/g, ""), 10) || null : null;

    const tagsRaw = field(block, "Personal Tags");
    const tags = tagsRaw
      ? tagsRaw
          .split(",")
          .map((t) => clean(t).toLowerCase())
          .filter(Boolean)
      : [];

    return {
      title: clean(titleLine),
      cleanTitle,
      author,
      status,
      rating,
      averageRating,
      ratingsCount,
      series,
      seriesNumber,
      isbn13,
      goodreadsUrl,
      tags,
      pages,
      key: toKey(isbn13, cleanTitle, author),
    };
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(books, null, 2), "utf8");

  // Summary for a sanity check.
  const byStatus = books.reduce<Record<string, number>>((acc, b) => {
    acc[b.status] = (acc[b.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Parsed ${books.length} books -> ${OUT}`);
  console.log("By status:", byStatus);
  console.log("With ISBN-13:", books.filter((b) => b.isbn13).length);
}

main();
