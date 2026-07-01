/**
 * Supabase persistence for the synced Goodreads library.
 */
import type { LibraryBook, ReadingStatus, ShelfTag } from "../src/types";

export const PROFILE_ID = "romi";

export interface LibraryBookRow {
  profile_id: string;
  book_key: string;
  title: string;
  clean_title: string;
  author: string;
  status: ReadingStatus;
  rating: number | null;
  average_rating: number | null;
  ratings_count: number | null;
  series: string | null;
  series_number: number | null;
  isbn13: string | null;
  goodreads_url: string | null;
  goodreads_book_id: string | null;
  tags: string[];
  pages: number | null;
  cover_url: string | null;
  description: string | null;
  synced_at: string;
}

export function bookToRow(book: LibraryBook, syncedAt: string): LibraryBookRow {
  return {
    profile_id: PROFILE_ID,
    book_key: book.key,
    title: book.title,
    clean_title: book.cleanTitle,
    author: book.author,
    status: book.status,
    rating: book.rating,
    average_rating: book.averageRating,
    ratings_count: book.ratingsCount,
    series: book.series,
    series_number: book.seriesNumber,
    isbn13: book.isbn13,
    goodreads_url: book.goodreadsUrl,
    goodreads_book_id: book.goodreadsBookId ?? null,
    tags: book.tags,
    pages: book.pages,
    cover_url: book.coverUrl ?? null,
    description: book.description ?? null,
    synced_at: syncedAt,
  };
}

export function rowToBook(row: LibraryBookRow): LibraryBook {
  return {
    key: row.book_key,
    title: row.title,
    cleanTitle: row.clean_title,
    author: row.author,
    status: row.status,
    rating: row.rating,
    averageRating: row.average_rating,
    ratingsCount: row.ratings_count,
    series: row.series,
    seriesNumber: row.series_number,
    isbn13: row.isbn13,
    goodreadsUrl: row.goodreads_url,
    tags: (row.tags ?? []) as ShelfTag[],
    pages: row.pages,
    coverUrl: row.cover_url,
    description: row.description,
    goodreadsBookId: row.goodreads_book_id,
  };
}
