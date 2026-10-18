import { getSupabaseBrowserClient } from "@/lib/supabase";
import { getBackendBaseUrl } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";

export const SESSION_EXPIRED = "connectsphere:session-expired";

export async function currentUser(): Promise<SessionUser | null> {
  const client = getSupabaseBrowserClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) return null;
  const response = await fetch(`${getBackendBaseUrl()}/api/auth/me`, {
    headers: { Authorization: `Bearer ${data.session.access_token}`, Accept: "application/json" }, cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    await client.auth.signOut({ scope: "local" }); return null;
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Could not verify your account.");
  return { ...body.user, authId: data.session.user.id };
}

export async function signOut() {
  const client = getSupabaseBrowserClient();
  const { data } = await client.auth.getSession();
  try {
    let revoked = !data.session;
    if (data.session) {
      try {
        const response = await fetch(`${getBackendBaseUrl()}/api/auth/logout`, {
          method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` },
        });
        revoked = response.ok;
      } catch { /* Use Supabase revocation if Express is unavailable. */ }
    }
    if (!revoked) {
      const result = await client.auth.signOut({ scope: "global" });
      if (result.error) throw result.error;
    }
  } finally {
    await client.auth.signOut({ scope: "local" });
    sessionStorage.removeItem("connectsphere:notice");
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith("connectsphere:recovery:")) sessionStorage.removeItem(key);
    }
  }
}
