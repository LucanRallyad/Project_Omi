/**
 * Runtime library — Supabase sync when available, static JSON as bootstrap fallback.
 */
import type { LibraryBook } from "../types";
import librarySeed from "../data/library.json";
import { isSupabaseConfigured, supabase, PROFILE_ID } from "./supabase";
import { rowToBook, type LibraryBookRow } from "../../lib/supabaseLibrary";

let library: LibraryBook[] = librarySeed as unknown as LibraryBook[];
let initialized = false;

export function getLibrary(): LibraryBook[] {
  return library;
}

export function setLibrary(books: LibraryBook[]): void {
  library = books;
  initialized = true;
}

/** Load the latest library from Supabase (falls back to baked JSON). */
export async function initLibrary(): Promise<LibraryBook[]> {
  if (initialized) return library;

  initialized = true;

  if (isSupabaseConfigured && supabase) {
    void supabase
      .from("library_books")
      .select("*")
      .eq("profile_id", PROFILE_ID)
      .then(({ data, error }) => {
        if (!error && data?.length) {
          library = (data as LibraryBookRow[]).map(rowToBook);
        }
      });
  }

  return library;
}

export function resetLibraryForTests(): void {
  library = librarySeed as unknown as LibraryBook[];
  initialized = false;
}
