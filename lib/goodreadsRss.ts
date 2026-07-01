/**
 * Goodreads shelf sync via public RSS feeds (no API key; works while logged out).
 *
 * Shelf list: https://www.goodreads.com/review/list_rss/{userId}?shelf={shelf}&page={n}
 * Returns up to 100 books per page.
 */

export type GoodreadsShelf =
  | "read"
  | "to-read"
  | "currently-reading"
  | "did-not-finish";

export type GoodreadsTagShelf = "favorites" | "romance" | "rom-coms" | "booktok" | "lgbtq";

export interface GoodreadsRssItem {
  bookId: string;
  title: string;
  author: string;
  shelf: GoodreadsShelf;
  userRating: number | null;
  averageRating: number | null;
  ratingsCount: number | null;
  isbn10: string | null;
  isbn13: string | null;
  pages: number | null;
  publishedYear: number | null;
  goodreadsUrl: string;
  coverUrl: string | null;
  description: string | null;
  dateAdded: string | null;
}

const USER_AGENT = "Mozilla/5.0 (compatible; BooksForRomi/1.0; +https://project-omi.vercel.app)";

function tagValue(block: string, tag: string): string | null {
  const re = new RegExp(
    `<${tag}>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</${tag}>`,
    "i"
  );
  const m = block.match(re);
  if (!m) return null;
  const val = (m[1] ?? m[2] ?? "").trim();
  return val || null;
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Convert ISBN-10 to ISBN-13 when possible. */
export function isbn10To13(isbn10: string): string | null {
  const digits = isbn10.replace(/\D/g, "");
  if (digits.length === 13) return digits;
  if (digits.length !== 10) return null;
  const core = `978${digits.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(core[i]!, 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

function parseItem(block: string, shelf: GoodreadsShelf): GoodreadsRssItem | null {
  const bookId = tagValue(block, "book_id");
  const title = tagValue(block, "title");
  const author = tagValue(block, "author_name");
  if (!bookId || !title || !author) return null;

  const isbnRaw = tagValue(block, "isbn");
  const isbn13 = isbnRaw ? isbn10To13(isbnRaw) : null;

  const userRatingRaw = tagValue(block, "user_rating");
  const userRating =
    userRatingRaw && userRatingRaw !== "0" ? parseInt(userRatingRaw, 10) : null;

  const avgRaw = tagValue(block, "average_rating");
  const averageRating = avgRaw ? parseFloat(avgRaw) : null;

  const pagesRaw = tagValue(block, "num_pages") ?? block.match(/<num_pages>(\d+)<\/num_pages>/)?.[1];
  const pages = pagesRaw ? parseInt(pagesRaw, 10) : null;

  const yearRaw = tagValue(block, "book_published");
  const publishedYear = yearRaw ? parseInt(yearRaw, 10) : null;

  const descriptionRaw = tagValue(block, "book_description");
  const description = descriptionRaw ? stripHtml(descriptionRaw) : null;

  const coverUrl =
    tagValue(block, "book_large_image_url") ??
    tagValue(block, "book_medium_image_url") ??
    tagValue(block, "book_image_url");

  return {
    bookId,
    title,
    author,
    shelf,
    userRating: Number.isFinite(userRating) ? userRating : null,
    averageRating: Number.isFinite(averageRating) ? averageRating : null,
    ratingsCount: null,
    isbn10: isbnRaw,
    isbn13,
    pages,
    publishedYear,
    goodreadsUrl: `https://www.goodreads.com/book/show/${bookId}`,
    coverUrl,
    description: description && description.length >= 40 ? description : null,
    dateAdded: tagValue(block, "user_date_added"),
  };
}

function parseRssPage(xml: string, shelf: GoodreadsShelf): GoodreadsRssItem[] {
  const items: GoodreadsRssItem[] = [];
  const parts = xml.split(/<item>/i).slice(1);
  for (const part of parts) {
    const block = part.split(/<\/item>/i)[0] ?? part;
    const parsed = parseItem(block, shelf);
    if (parsed) items.push(parsed);
  }
  return items;
}

async function fetchRssPage(
  userId: string,
  shelf: string,
  page: number
): Promise<string> {
  const url = new URL(`https://www.goodreads.com/review/list_rss/${userId}`);
  url.searchParams.set("shelf", shelf);
  if (page > 1) url.searchParams.set("page", String(page));

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Goodreads RSS ${shelf} page ${page}: HTTP ${res.status}`);
  return res.text();
}

/** Fetch every book on a shelf, following RSS pagination (100 per page). */
export async function fetchGoodreadsShelf(
  userId: string,
  shelf: GoodreadsShelf
): Promise<GoodreadsRssItem[]> {
  const all: GoodreadsRssItem[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= 20; page++) {
    const xml = await fetchRssPage(userId, shelf, page);
    const batch = parseRssPage(xml, shelf);
    if (!batch.length) break;

    let added = 0;
    for (const item of batch) {
      if (seen.has(item.bookId)) continue;
      seen.add(item.bookId);
      all.push(item);
      added++;
    }
    if (batch.length < 100 || added === 0) break;
    await new Promise((r) => setTimeout(r, 400));
  }

  return all;
}

/** Fetch book IDs on a tag shelf (favorites, romance, …). */
export async function fetchGoodreadsTagBookIds(
  userId: string,
  tag: GoodreadsTagShelf
): Promise<Set<string>> {
  const xml = await fetchRssPage(userId, tag, 1);
  const ids = new Set<string>();
  for (const part of xml.split(/<item>/i).slice(1)) {
    const block = part.split(/<\/item>/i)[0] ?? part;
    const id = tagValue(block, "book_id");
    if (id) ids.add(id);
  }
  return ids;
}
