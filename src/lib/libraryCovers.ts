/**
 * Baked cover URLs for library books — loaded on demand to keep the main bundle small.
 */
import { getLibrary } from "./libraryStore";

let libraryCovers: Record<string, string> | null = null;
let coversReady: Promise<void> | null = null;

/** Load baked cover map (deferred from initial bundle). */
export async function warmCoverIndex(): Promise<void> {
  if (!coversReady) {
    coversReady = (async () => {
      const mod = await import("../data/library-covers.json");
      libraryCovers = mod.default as Record<string, string>;
    })();
  }
  await coversReady;
}

export function getLibraryCoverUrl(bookKey: string): string | null {
  const baked = libraryCovers?.[bookKey];
  if (baked) return baked;
  const synced = getLibrary().find((b) => b.key === bookKey)?.coverUrl;
  return synced ?? null;
}

export function allLibraryCoverEntries(): Record<string, string> {
  return libraryCovers ?? {};
}
