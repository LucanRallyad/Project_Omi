/**
 * Shared post-sync steps: upsert library rows and refresh taste weights.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LibraryBook } from "../src/types";
import {
  buildTasteProfile,
  nonCandidateLibraryKeys,
  tasteWeightsFromProfile,
} from "../src/lib/libraryProfile";
import { setLibrary } from "../src/lib/libraryStore";
import { bookToRow, PROFILE_ID } from "./supabaseLibrary";

const BATCH = 100;

async function upsertBatches<T extends object>(
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

export async function persistLibrarySync(
  supabase: SupabaseClient,
  books: LibraryBook[],
  syncedAt: string
): Promise<void> {
  setLibrary(books);

  const rows = books.map((b) => bookToRow(b, syncedAt));
  await upsertBatches("library_books", rows, async (batch) =>
    supabase.from("library_books").upsert(batch, { onConflict: "profile_id,book_key" })
  );

  const excludeKeys = new Set(nonCandidateLibraryKeys());
  const excludeBooks = books.filter((b) => excludeKeys.has(b.key));

  const { data: existingSwipes } = await supabase
    .from("swipes")
    .select("book_key")
    .eq("profile_id", PROFILE_ID);
  const swipeKeys = new Set((existingSwipes ?? []).map((s) => s.book_key));

  const swipeRows = excludeBooks
    .filter((b) => !swipeKeys.has(b.key))
    .map((b) => ({
      profile_id: PROFILE_ID,
      book_key: b.key,
      direction: "pass" as const,
      created_at: syncedAt,
    }));

  if (swipeRows.length) {
    await upsertBatches("swipes", swipeRows, async (batch) =>
      supabase.from("swipes").upsert(batch, { onConflict: "profile_id,book_key" })
    );
  }

  const libraryWeights = tasteWeightsFromProfile(buildTasteProfile());
  const weightRows = libraryWeights.map((w) => ({ ...w, profile_id: PROFILE_ID }));

  const { error: deleteError } = await supabase
    .from("taste_weights")
    .delete()
    .eq("profile_id", PROFILE_ID);
  if (deleteError) throw new Error(`taste_weights delete: ${deleteError.message}`);

  await upsertBatches("taste_weights", weightRows, async (batch) =>
    supabase.from("taste_weights").upsert(batch, {
      onConflict: "profile_id,feature_type,feature_value",
    })
  );
}
