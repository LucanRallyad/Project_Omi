/**
 * Runtime library — Supabase sync when available, static JSON as bootstrap fallback.
 */
import type { LibraryBook } from "../types";
import librarySeed from "../data/library.json";
import { isSupabaseConfigured, supabase, PROFILE_ID } from "./supabase";
import { rowToBook, type LibraryBookRow } from "../../lib/supabaseLibrary";
import { indexLibraryDescriptions } from "./libraryDescriptions";

let library: LibraryBook[] = librarySeed as unknown as LibraryBook[];
let initialized = false;

export function getLibrary(): LibraryBook[] {
  return library;
}

export function setLibrary(books: LibraryBook[]): void {
  library = books;
  initialized = true;
  indexLibraryDescriptions(library);
}

/** Pull the latest library rows from Supabase (no-op when offline / unconfigured). */
export async function loadLibraryFromSupabase(): Promise<LibraryBook[]> {
  if (!isSupabaseConfigured || !supabase) return library;

  const { data, error } = await supabase
    .from("library_books")
    .select("*")
    .eq("profile_id", PROFILE_ID);

  if (!error && data?.length) {
    library = (data as LibraryBookRow[]).map(rowToBook);
    indexLibraryDescriptions(library);
  }

  return library;
}

/** Load library once at app start (Supabase when available, else baked JSON). */
export async function initLibrary(): Promise<LibraryBook[]> {
  if (initialized) return library;
  await loadLibraryFromSupabase();
  initialized = true;
  return library;
}

/** Re-fetch library from Supabase — used after weekly Goodreads sync / opening the reading map. */
export async function refreshLibrary(): Promise<LibraryBook[]> {
  return loadLibraryFromSupabase();
}

/** Most recent Goodreads sync timestamp from library rows, if any. */
export function librarySyncedAt(): string | null {
  let latest: string | null = null;
  for (const book of library) {
    if (book.syncedAt && (!latest || book.syncedAt > latest)) latest = book.syncedAt;
  }
  return latest;
}

export function resetLibraryForTests(): void {
  library = librarySeed as unknown as LibraryBook[];
  initialized = false;
}
