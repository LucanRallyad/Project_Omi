import type { VercelRequest, VercelResponse } from "../../lib/vercelTypes";
import { createClient } from "@supabase/supabase-js";
import { syncGoodreadsLibrary } from "../../lib/goodreadsSync";
import { persistLibrarySync } from "../../lib/persistLibrarySync";
import { PROFILE_ID } from "../../lib/supabaseLibrary";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const userId = process.env.GOODREADS_USER_ID ?? "71171257";
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    res.status(503).json({ error: "Supabase not configured" });
    return;
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  let runId: number | null = null;

  try {
    const { data: run, error: runError } = await supabase
      .from("goodreads_sync_runs")
      .insert({ profile_id: PROFILE_ID, status: "running" })
      .select("id")
      .single();

    if (runError) throw new Error(runError.message);
    runId = run.id as number;

    const result = await syncGoodreadsLibrary(userId);
    await persistLibrarySync(supabase, result.books, result.syncedAt);

    await supabase
      .from("goodreads_sync_runs")
      .update({
        finished_at: new Date().toISOString(),
        books_count: result.books.length,
        status: "success",
      })
      .eq("id", runId);

    res.status(200).json({
      ok: true,
      syncedAt: result.syncedAt,
      total: result.books.length,
      byStatus: result.byStatus,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    if (runId != null) {
      await supabase
        .from("goodreads_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "error",
          error_message: message,
        })
        .eq("id", runId);
    }
    res.status(500).json({ error: message });
  }
}
