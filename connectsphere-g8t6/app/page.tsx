"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api/events";
import { useAuth } from "@/components/auth/auth-provider";

type AuthView = "loading" | "login" | "coordinator-lead" | "organiser" | "forbidden";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<AuthView>("loading");

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      // Redirect decisions only run once auth state has finished loading.
      if (loading) return;
      if (!session) {
        if (mounted) {
          setView("login");
          router.replace("/login");
        }
        return;
      }
      try {
        const result = await getCurrentUser(session.access_token);
        if (!mounted) return;
        if (result.user.role === "COORDINATOR_LEAD") setView("coordinator-lead");
        else if (result.user.role === "ORGANISER") setView("organiser");
        else setView("forbidden");
      } catch {
        if (!mounted) return;
        // Session exists but we couldn't resolve the role — don't bounce back
        // to /login (that loops). Show the access-denied state instead.
        setView("forbidden");
      }
    };
    void run();
    return () => { mounted = false; };
  }, [session, loading, router]);

  useEffect(() => {
    if (view === "coordinator-lead") router.replace("/events");
    else if (view === "organiser") router.replace("/dashboard");
  }, [view, router]);

  if (view === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
        <section className="w-full max-w-md rounded-panel bg-surface-container-lowest p-6 shadow-elevation-1 sm:p-9">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-label text-primary">ConnectSphere</span>
            <h1 className="mt-3 text-3xl font-bold text-on-surface">Loading</h1>
            <p className="mt-2 text-sm text-on-surface-variant">Checking your authenticated session.</p>
          </div>
        </section>
      </main>
    );
  }

  if (view === "forbidden") {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
        <section className="w-full max-w-md rounded-panel bg-surface-container-lowest p-6 shadow-elevation-1 sm:p-9">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-label text-error">ACCESS DENIED</span>
            <h1 className="mt-3 text-3xl font-bold text-on-surface">Insufficient permissions</h1>
            <p className="mt-2 text-sm text-on-surface-variant">Your account does not have permission to access ConnectSphere.</p>
          </div>
        </section>
      </main>
    );
  }

  return null;
}
