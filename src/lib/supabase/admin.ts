import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getServerSupabaseConfig } from "@/lib/env";

let adminClient: SupabaseClient | undefined;

export function getSupabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const { url, serviceRoleKey } = getServerSupabaseConfig();
    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: { headers: { "X-Client-Info": "schulung-wimpern-server" } },
    });
  }
  return adminClient;
}
