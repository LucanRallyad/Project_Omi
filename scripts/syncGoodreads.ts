/**
 * Pull Romi's Goodreads library via RSS and persist to Supabase + library.json.
 *
 * Usage: npm run sync-goodreads
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { syncGoodreadsLibrary } from "../lib/goodreadsSync";
import { persistLibrarySync } from "../lib/persistLibrarySync";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIBRARY_PATH = resolve(ROOT, "src/data/library.json");
const COVERS_PATH = resolve(ROOT, "src/data/library-covers.json");
const DESCRIPTIONS_PATH = resolve(ROOT, "src/data/library-descriptions.json");
const DEFAULT_USER_ID = "71171257";

function loadEnvLocal(): void {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function mergeBakedJson(
  path: string,
  books: { key: string; coverUrl?: string | null; description?: string | null }[],
  field: "coverUrl" | "description"
): number {
  const existing: Record<string, string> = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, string>)
    : {};
  let added = 0;
  for (const book of books) {
    const value = book[field];
    if (!value || existing[book.key]) continue;
    existing[book.key] = value;
    added++;
  }
  writeFileSync(path, `${JSON.stringify(existing, null, 2)}\n`);
  return added;
}

async function main() {
  loadEnvLocal();

  const userId = process.env.GOODREADS_USER_ID ?? DEFAULT_USER_ID;
  console.log(`Syncing Goodreads library for user ${userId}…`);

  const result = await syncGoodreadsLibrary(userId);
  writeFileSync(LIBRARY_PATH, `${JSON.stringify(result.books, null, 2)}\n`);

  const coversAdded = mergeBakedJson(COVERS_PATH, result.books, "coverUrl");
  const descriptionsAdded = mergeBakedJson(DESCRIPTIONS_PATH, result.books, "description");

  console.log(`Fetched ${result.books.length} books (${result.syncedAt})`);
  for (const [status, count] of Object.entries(result.byStatus).sort()) {
    console.log(`  ${status}: ${count}`);
  }
  console.log(`Wrote ${LIBRARY_PATH}`);
  console.log(`Baked covers +${coversAdded}, descriptions +${descriptionsAdded}`);

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.log("Supabase not configured — skipped DB persist (library.json updated).");
    return;
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  await persistLibrarySync(supabase, result.books, result.syncedAt);
  console.log("Supabase library_books, swipes, and taste_weights updated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
