"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicSupabaseConfig } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    const { url, anonKey } = getPublicSupabaseConfig();
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
