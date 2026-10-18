"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertBanner, Skeleton } from "@/components/shared/primitives";
import { homeForRole, loginUrl, type SessionUser, type UserRole } from "@/lib/auth";
import { currentUser, SESSION_EXPIRED } from "@/lib/session";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const UserContext = createContext<SessionUser | null>(null);
export const useSessionUser = () => useContext(UserContext);

export function AuthGate({ children, role }: { children: ReactNode; role?: UserRole }) {
  const pathname = usePathname(); const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState(""); const [checking, setChecking] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let alive = true; let revision = 0;
    const redirect = () => {
      revision += 1;
      if (!alive) return;
      setUser(null); setChecking(true);
      router.replace(loginUrl(`${window.location.pathname}${window.location.search}`));
    };
    const check = async () => {
      const current = ++revision;
      setChecking(true);
      try {
        const result = await currentUser();
        if (!alive || current !== revision) return;
        if (!result) { redirect(); return; }
        setUser(result); setError(""); setChecking(false);
      } catch (caught) {
        if (alive && current === revision) {
          setUser(null); setError(caught instanceof Error ? caught.message : "Could not verify your account."); setChecking(false);
        }
      }
    };
    let unsubscribe = () => {};
    try {
      const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => { if (!session) redirect(); });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { /* check() displays configuration failures. */ }
    void check();
    const pageShow = () => { void check(); };
    const pageHide = () => { setUser(null); setChecking(true); };
    window.addEventListener("pageshow", pageShow); window.addEventListener("pagehide", pageHide);
    window.addEventListener(SESSION_EXPIRED, redirect);
    return () => {
      alive = false; unsubscribe();
      window.removeEventListener("pageshow", pageShow); window.removeEventListener("pagehide", pageHide);
      window.removeEventListener(SESSION_EXPIRED, redirect);
    };
  }, [pathname, retry, router]);

  if (checking) return <main className="mx-auto w-full max-w-5xl space-y-4 p-6"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-48 w-full" /></main>;
  if (error) return <main className="mx-auto mt-16 max-w-xl p-5"><AlertBanner title="Could not open your workspace" tone="error">{error}<button className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Retry connection</button></AlertBanner></main>;
  if (!user) return null;
  if (role && user.role !== role) return <main className="mx-auto mt-16 max-w-xl p-5"><AlertBanner title="Access denied" tone="error">This page is not available for your role. <Link className="underline" href={homeForRole(user.role)}>Go to your dashboard</Link></AlertBanner></main>;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
