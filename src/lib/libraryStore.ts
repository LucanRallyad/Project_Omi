/**
 * Runtime library — Supabase sync when available, static JSON as bootstrap fallback.
 */
import type { LibraryBook } from "../types";
import { indexLibraryDescriptions } from "./libraryDescriptions.js";
import { isSupabaseConfigured, supabase, PROFILE_ID } from "./supabase.js";
import { rowToBook, type LibraryBookRow } from "../../lib/supabaseLibrary.js";

let library: LibraryBook[] = [];
let initialized = false;
let seedPromise: Promise<LibraryBook[]> | null = null;

async function loadSeedLibrary(): Promise<LibraryBook[]> {
  if (!seedPromise) {
    seedPromise = import("../data/library.json").then((mod) => mod.default as LibraryBook[]);
  }
  return seedPromise;
}

export function getLibrary(): LibraryBook[] {
  return library;
}

export function setLibrary(books: LibraryBook[]): void {
  library = books;
  initialized = true;
  indexLibraryDescriptions(books);
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

  if (isSupabaseConfigured && supabase) {
    await loadLibraryFromSupabase();
  }

  if (!library.length) {
    library = await loadSeedLibrary();
    indexLibraryDescriptions(library);
  }

  initialized = true;
  return library;
}

/** Re-fetch library from Supabase — used after weekly Goodreads sync / opening the reading map. */
export async function refreshLibrary(): Promise<LibraryBook[]> {
  if (isSupabaseConfigured && supabase) {
    await loadLibraryFromSupabase();
  }
  return library;
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
  library = [];
  initialized = false;
  seedPromise = null;
}
