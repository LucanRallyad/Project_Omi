/**
 * Seeds Supabase with Romi's Goodreads library:
 * - `swipes` (pass) for read / currently-reading / DNF books so they never resurface
 * - `taste_weights` from her star ratings and shelf tags to train recommendations
 *
 * Run after parse-library: npm run seed-library
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import type { LibraryBook, TasteWeight } from "../src/types";
import {
  buildTasteProfile,
  nonCandidateLibraryKeys,
  tasteWeightsFromProfile,
} from "../src/lib/libraryProfile";
import { setLibrary } from "../src/lib/libraryStore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const LIBRARY_PATH = resolve(ROOT, "src/data/library.json");
const PROFILE_ID = "romi";
const BATCH = 100;

function loadEnvLocal(): void {
  const path = resolve(ROOT, ".env.local");
  if (!existsSync(path)) return;
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

function mergeWeights(base: TasteWeight[], delta: TasteWeight[]): TasteWeight[] {
  const map = new Map<string, TasteWeight>();
  for (const w of base) map.set(`${w.feature_type}:${w.feature_value}`, { ...w });
  for (const d of delta) {
    const key = `${d.feature_type}:${d.feature_value}`;
    const existing = map.get(key);
    if (existing) existing.weight += d.weight;
    else map.set(key, { ...d });
  }
  return [...map.values()];
}

async function upsertBatches<T extends Record<string, unknown>>(
  label: string,
  rows: T[],
  upsert: (batch: T[]) => Promise<{ error: { message: string } | null }>
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await upsert(batch);
    if (error) throw new Error(`${label} batch ${i / BATCH + 1}: ${error.message}`);
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  if (!existsSync(LIBRARY_PATH)) {
    console.error("library.json not found — run npm run parse-library first");
    process.exit(1);
  }

  const library = JSON.parse(readFileSync(LIBRARY_PATH, "utf8")) as LibraryBook[];
  setLibrary(library);
  const excludeKeys = new Set(nonCandidateLibraryKeys());
  const excludeBooks = library.filter((b) => excludeKeys.has(b.key));

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });

  const { data: existingSwipes, error: swipeLoadError } = await supabase
    .from("swipes")
    .select("book_key, direction")
    .eq("profile_id", PROFILE_ID);
  if (swipeLoadError) throw new Error(swipeLoadError.message);

  const existingSwipeKeys = new Set((existingSwipes ?? []).map((s) => s.book_key));
  const swipeRows = excludeBooks
    .filter((b) => !existingSwipeKeys.has(b.key))
    .map((b) => ({
      profile_id: PROFILE_ID,
      book_key: b.key,
      direction: "pass" as const,
      created_at: new Date().toISOString(),
    }));

  if (swipeRows.length) {
    await upsertBatches("swipes", swipeRows, async (batch) =>
      supabase.from("swipes").upsert(batch, { onConflict: "profile_id,book_key" })
    );
  }

  const libraryWeights = tasteWeightsFromProfile(buildTasteProfile());

  const { data: existingWeights, error: weightLoadError } = await supabase
    .from("taste_weights")
    .select("feature_type, feature_value, weight")
    .eq("profile_id", PROFILE_ID);
  if (weightLoadError) throw new Error(weightLoadError.message);

  const mergedWeights = mergeWeights(libraryWeights, (existingWeights ?? []) as TasteWeight[]);
  const weightRows = mergedWeights.map((w) => ({ ...w, profile_id: PROFILE_ID }));

  await upsertBatches("taste_weights", weightRows, async (batch) =>
    supabase.from("taste_weights").upsert(batch, {
      onConflict: "profile_id,feature_type,feature_value",
    })
  );

  const profile = buildTasteProfile();
  console.log(`Seeded library for ${PROFILE_ID}:`);
  console.log(`  swipes added: ${swipeRows.length} pass (${existingSwipeKeys.size} already present)`);
  console.log(`  taste weights: ${weightRows.length} (${libraryWeights.length} from library)`);
  console.log(`  top authors: ${profile.topAuthors.slice(0, 5).join(", ")}`);
  console.log(`  top genres: ${profile.topGenres.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
