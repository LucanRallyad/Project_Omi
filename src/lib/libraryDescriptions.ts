/**
 * Baked + synced book descriptions — O(1) lookup via in-memory index.
 */
import type { LibraryBook } from "../types";
import librarySeed from "../data/library.json";
import libraryDescriptionsData from "../data/library-descriptions.json";
import { getLibrary } from "./libraryStore";

const descriptionIndex = new Map<string, string>();

function indexDescription(key: string, text: string | null | undefined): void {
  if (!text || text.length < 40) return;
  const existing = descriptionIndex.get(key);
  if (!existing || text.length > existing.length) {
    descriptionIndex.set(key, text);
  }
}

for (const [key, text] of Object.entries(libraryDescriptionsData as Record<string, string>)) {
  indexDescription(key, text);
}

for (const book of librarySeed as unknown as LibraryBook[]) {
  indexDescription(book.key, book.description);
}

/** Merge descriptions from a Supabase refresh without rebuilding the whole app. */
export function indexLibraryDescriptions(books: LibraryBook[]): void {
  for (const book of books) {
    indexDescription(book.key, book.description);
  }
}

export function getLibraryDescription(bookKey: string): string | null {
  const hit = descriptionIndex.get(bookKey);
  if (hit) return hit;
  const synced = getLibrary().find((b) => b.key === bookKey)?.description;
  if (synced) indexDescription(bookKey, synced);
  return synced ?? null;
}

export function allLibraryDescriptionEntries(): Record<string, string> {
  return Object.fromEntries(descriptionIndex);
}
