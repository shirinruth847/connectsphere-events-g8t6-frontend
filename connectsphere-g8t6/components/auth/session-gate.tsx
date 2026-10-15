"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertBanner, Button, Skeleton } from "@/components/shared/primitives";
import { getBackendBaseUrl } from "@/lib/api";
import { getSupabaseBrowserClient, SupabaseConfigurationError } from "@/lib/supabase";

// Role-neutral version of OrganiserGate for pages every signed-in role can open
// (the SPM-33 event workspace and the role-specific dashboard). It confirms the
// session and active profile with the backend and exposes the profile's roles
// so a page can pick its shell. Roles only shape presentation; the backend
// still authorises every request.

export interface SessionProfile {
  name: string;
  email: string;
  avatarUrl?: string;
  roles: string[];
}

type GateState = "loading" | "ready" | "configuration" | "error";
const PROFILE_TIMEOUT_MS = 15_000;
type AuthenticatedUser = { name?: string; email?: string; role?: string; roles?: string[] };
type AuthMeResponse = { user?: AuthenticatedUser; error?: string } & AuthenticatedUser;

const SessionProfileContext = createContext<SessionProfile | null>(null);

export function useSessionProfile() {
  const profile = useContext(SessionProfileContext);
  if (!profile) throw new Error("useSessionProfile must be used inside <SessionGate>.");
  return profile;
}

export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [profile, setProfile] = useState<SessionProfile | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const client = getSupabaseBrowserClient();
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const session = data.session;
        if (!session) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        let response: Response;
        try {
          response = await fetch(`${getBackendBaseUrl()}/api/auth/me`, {
            headers: { Accept: "application/json", Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
            // Without a limit a stalled backend leaves the page on its loading skeleton forever.
            signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS),
          });
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === "TimeoutError") {
            throw new Error("ConnectSphere took too long to confirm your account. Check that the backend is running, then try again.");
          }
          if (caught instanceof TypeError) {
            throw new Error(`Cannot reach the ConnectSphere API at ${getBackendBaseUrl()}. Start the backend and check NEXT_PUBLIC_BACKEND_URL.`);
          }
          throw caught;
        }
        const body = (await response.json().catch(() => ({}))) as AuthMeResponse;
        if (response.status === 401 || response.status === 403) {
          await client.auth.signOut();
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!response.ok) throw new Error(body.error || "Could not verify your ConnectSphere profile.");
        const user = body.user ?? body;
        const roles = user.roles ?? [user.role].filter((role): role is string => Boolean(role));
        const metadata = session.user.user_metadata ?? {};
        const avatarUrl = typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined;
        const name = user.name?.trim() || session.user.email?.split("@")[0] || "Signed-in user";
        if (alive) {
          setProfile({ name, email: user.email || session.user.email || "", avatarUrl, roles });
          setState("ready");
        }
      } catch (caught) {
        if (!alive) return;
        if (caught instanceof SupabaseConfigurationError) {
          setState("configuration");
        } else {
          setError(caught instanceof Error ? caught.message : "Could not verify your account.");
          setState("error");
        }
      }
    };
    void check();
    return () => {
      alive = false;
    };
  }, [pathname, retry, router]);

  if (state === "configuration") {
    return (
      <main className="mx-auto mt-16 w-full max-w-xl p-5">
        <AlertBanner title="Authentication setup is incomplete" tone="warning">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to the frontend <code>.env.local</code>, then restart Next.js.
        </AlertBanner>
      </main>
    );
  }
  if (state === "error") {
    return (
      <main className="mx-auto mt-16 w-full max-w-xl p-5">
        <AlertBanner title="Could not open your workspace" tone="error">
          {error}
          <div className="mt-3">
            <Button variant="danger" onClick={() => { setState("loading"); setRetry((value) => value + 1); }}>Retry</Button>
          </div>
        </AlertBanner>
      </main>
    );
  }
  if (state === "loading" || !profile) {
    return (
      <main className="mx-auto w-full max-w-5xl space-y-4 p-6" aria-busy="true" aria-label="Checking your session">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </main>
    );
  }
  return <SessionProfileContext.Provider value={profile}>{children}</SessionProfileContext.Provider>;
}
