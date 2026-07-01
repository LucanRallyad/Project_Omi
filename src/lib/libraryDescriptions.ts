/**
 * Baked + synced book descriptions — loaded on demand to keep the main bundle small.
 */
import type { LibraryBook } from "../types";
import { getLibrary } from "./libraryStore.js";

const descriptionIndex = new Map<string, string>();
let descriptionsReady: Promise<void> | null = null;

function indexDescription(key: string, text: string | null | undefined): void {
  if (!text || text.length < 40) return;
  const existing = descriptionIndex.get(key);
  if (!existing || text.length > existing.length) {
    descriptionIndex.set(key, text);
  }
}

async function loadBakedDescriptions(): Promise<void> {
  const mod = await import("../data/library-descriptions.json");
  for (const [key, text] of Object.entries(mod.default as Record<string, string>)) {
    indexDescription(key, text);
  }
}

/** Load baked descriptions JSON (deferred from initial bundle). */
export async function warmDescriptionIndex(): Promise<void> {
  if (!descriptionsReady) {
    descriptionsReady = (async () => {
      await loadBakedDescriptions();
      for (const book of getLibrary()) {
        indexDescription(book.key, book.description);
      }
    })();
  }
  await descriptionsReady;
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
