import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config.js";

export function makeSupabase(c: AppConfig): SupabaseClient {
  return createClient(c.supabaseUrl, c.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
