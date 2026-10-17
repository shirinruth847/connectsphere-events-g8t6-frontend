// Supabase Auth integration for the browser (Master section 2.6: lib/auth owns
// session handling, not authorization policy). Only Auth is called here;
// business data always goes through the Express backend.

import { createClient, isAuthError, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Created lazily so prerendering and builds do not need the browser env.
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

// Returns a current (auto-refreshed) access token, or null when signed out.
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export type SignInFailure = "INVALID_CREDENTIALS" | "RATE_LIMITED" | "NETWORK_ERROR" | "UNKNOWN";

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<{ accessToken: string } | { failure: SignInFailure }> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return { failure: classifySignInError(error) };
  }
  return { accessToken: data.session.access_token };
}

// Unknown email, wrong password and unconfirmed accounts all collapse into
// one generic failure so the UI never reveals which credential was wrong.
function classifySignInError(error: unknown): SignInFailure {
  if (!isAuthError(error)) return "UNKNOWN";
  if (error.status === 429) return "RATE_LIMITED";
  if (error.status === 0 || error.name === "AuthRetryableFetchError") return "NETWORK_ERROR";
  if (error.status !== undefined && error.status >= 400 && error.status < 500) return "INVALID_CREDENTIALS";
  return "UNKNOWN";
}

// Clears only this browser's session; other devices stay signed in.
export async function signOutLocally() {
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch {
    // The local session is removed even when the network call fails.
  }
}
