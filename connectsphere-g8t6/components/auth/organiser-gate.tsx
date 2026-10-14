"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertBanner, Skeleton } from "@/components/shared/primitives";
import { getBackendBaseUrl } from "@/lib/api";
import { getSupabaseBrowserClient, SupabaseConfigurationError } from "@/lib/supabase";

type GateState = "loading" | "ready" | "configuration" | "error";
export type OrganiserProfile = { name: string; email: string; avatarUrl?: string };

type AuthenticatedUser = { name?: string; email?: string; role?: string; roles?: string[] };
type AuthMeResponse = { user?: AuthenticatedUser; error?: string } & AuthenticatedUser;

const FALLBACK_PROFILE: OrganiserProfile = { name: "Signed-in user", email: "" };
const OrganiserProfileContext = createContext<OrganiserProfile>(FALLBACK_PROFILE);

export const useOrganiserProfile = () => useContext(OrganiserProfileContext);

export function OrganiserGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [profile, setProfile] = useState<OrganiserProfile>(FALLBACK_PROFILE);

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
          });
        } catch (caught) {
          if (caught instanceof TypeError) {
            throw new Error(`Cannot reach the ConnectSphere API at ${getBackendBaseUrl()}. Start the backend with “npm run dev” in the backend project, and make sure NEXT_PUBLIC_BACKEND_URL points to that host and port.`);
          }
          throw caught;
        }
        const body = await response.json().catch(() => ({})) as AuthMeResponse;
        if (response.status === 401 || response.status === 403) {
          await client.auth.signOut();
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
          return;
        }
        if (!response.ok) throw new Error(body.error || "Could not verify your ConnectSphere profile.");
        const profile = body.user ?? body;
        const roles = profile.roles ?? [profile.role].filter(Boolean);
        if (!roles.includes("ORGANISER")) {
          setError("This workspace is for event organisers. Your account does not have the ORGANISER role.");
          setState("error");
          return;
        }
        const metadata = session.user.user_metadata ?? {};
        const metadataName = [metadata.full_name, metadata.name, metadata.display_name]
          .find((value) => typeof value === "string" && value.trim());
        const metadataAvatar = typeof metadata.avatar_url === "string"
          ? metadata.avatar_url
          : typeof metadata.picture === "string" ? metadata.picture : undefined;
        const displayName = typeof profile.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : typeof metadataName === "string" ? metadataName.trim() : session.user.email?.split("@")[0] || "Signed-in user";
        if (alive) {
          setProfile({ name: displayName, email: profile.email || session.user.email || "", avatarUrl: metadataAvatar });
          setState("ready");
        }
      } catch (caught) {
        if (caught instanceof SupabaseConfigurationError) {
          if (alive) setState("configuration");
        } else {
          if (alive) {
            setError(caught instanceof Error ? caught.message : "Could not verify your account.");
            setState("error");
          }
        }
      }
    };
    void check();
    return () => { alive = false; };
  }, [pathname, retry, router]);

  if (state === "loading") return <main className="mx-auto w-full max-w-5xl space-y-4 p-6"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-48 w-full" /></main>;
  if (state === "configuration") return <main className="mx-auto mt-16 w-full max-w-xl p-5"><AlertBanner title="Authentication setup is incomplete" tone="warning">Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (or <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) to the frontend <code>.env.local</code>, and set <code>NEXT_PUBLIC_BACKEND_URL</code> if your API is not at localhost:8000. Restart Next.js after editing.</AlertBanner></main>;
  if (state === "error") return <main className="mx-auto mt-16 w-full max-w-xl p-5"><AlertBanner title="Could not open the organiser workspace" tone="error">{error}<p className="mt-2">If the API is running, confirm its CORS frontend origin and your event organiser profile.</p><button className="mt-4 min-h-10 rounded-control bg-error px-4 py-2 text-sm font-semibold text-white hover:bg-error-on-surface" onClick={() => { setState("loading"); setRetry((value) => value + 1); }}>Retry connection</button></AlertBanner></main>;
  return <OrganiserProfileContext.Provider value={profile}>{children}</OrganiserProfileContext.Provider>;
}
