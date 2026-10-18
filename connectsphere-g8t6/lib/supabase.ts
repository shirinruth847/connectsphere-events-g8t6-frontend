"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

// True only while clearing a session the backend has already revoked. The
// SDK's signOut always POSTs /auth/v1/logout with the stored token; that
// request is answered locally instead of re-sending the revoked token.
let remoteLogoutDone = false;

const authFetch: typeof fetch = (input, init) => {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (remoteLogoutDone && new URL(href).pathname.endsWith("/auth/v1/logout")) {
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return fetch(input, init);
};

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
    global: { fetch: authFetch },
  });

  return browserClient;
};

/**
 * Clears this browser's session (storage, refresh timer, SIGNED_OUT event for
 * every tab) after POST /api/auth/logout revoked it, without a second remote
 * logout.
 */
export const clearRevokedSession = async () => {
  const client = getSupabaseBrowserClient();
  remoteLogoutDone = true;
  try {
    return await client.auth.signOut({ scope: "local" });
  } finally {
    remoteLogoutDone = false;
  }
};

export const getAccessToken = async () => {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
};
