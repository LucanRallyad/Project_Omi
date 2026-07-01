import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function env(key: string): string | undefined {
  if (typeof import.meta !== "undefined" && import.meta.env?.[key]) {
    return String(import.meta.env[key]);
  }
  return process.env[key];
}

const url = env("VITE_SUPABASE_URL");
const anonKey = env("VITE_SUPABASE_ANON_KEY");

/**
 * The app is single-user (a personal gift), so we scope every row to one fixed
 * profile id. Row Level Security policies check this value server-side.
 */
export const PROFILE_ID = "romi";

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    })
  : null;
