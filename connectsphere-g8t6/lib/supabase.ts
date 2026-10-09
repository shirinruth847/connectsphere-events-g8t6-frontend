"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export class SupabaseConfigurationError extends Error {
  constructor() {
    super(
      "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the frontend .env.local file, then restart Next.js.",
    );
    this.name = "SupabaseConfigurationError";
  }
}

export const getSupabaseBrowserClient = () => {
  if (typeof window === "undefined") {
    throw new Error("The Supabase browser client can only be used in the browser.");
  }

  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey) throw new SupabaseConfigurationError();

  browserClient = createClient(url, publicKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
};

export const getAccessToken = async () => {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
};
