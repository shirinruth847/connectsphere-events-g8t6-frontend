"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getCurrentUser } from "@/lib/api/events";
import { useAuth } from "@/lib/auth/AuthProvider";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";

type AuthState = "loading" | "unauthenticated" | "coordinator-lead" | "organiser" | "forbidden";

export default function Home() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseBrowserClient();

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (!session?.access_token) {
        setAuthState("unauthenticated");
        return;
      }
      try {
        const result = await getCurrentUser(session.access_token);
        if (result.user.role === "COORDINATOR_LEAD") {
          setAuthState("coordinator-lead");
        } else if (result.user.role === "ORGANISER") {
          setAuthState("organiser");
        } else {
          setAuthState("forbidden");
        }
      } catch {
        setAuthState("unauthenticated");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthState("unauthenticated");
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data, error: signInError } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
      if (signInError || !data.session) throw signInError ?? new Error("Sign-in did not return an active session.");
      const result = await getCurrentUser(data.session.access_token);
      if (result.user.role === "COORDINATOR_LEAD") {
        setAuthState("coordinator-lead");
      } else if (result.user.role === "ORGANISER") {
        setAuthState("organiser");
      } else {
        setAuthState("forbidden");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Shared SPM-32 logout: POST /api/auth/logout, then local session cleanup.
  async function handleSignOut() {
    await signOut();
    setAuthState("unauthenticated");
  }

  if (authState === "loading") {
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

  if (authState === "unauthenticated") {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
        <section className="w-full max-w-md rounded-panel bg-surface-container-lowest p-6 shadow-elevation-1 sm:p-9">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-label text-primary">ConnectSphere</span>
            <h1 className="mt-3 text-3xl font-bold text-on-surface">Welcome back</h1>
            <p className="mt-2 text-sm text-on-surface-variant">Sign in with your Event Coordinator Lead or Organiser account.</p>
          </div>
          <form onSubmit={handleSignIn} className="space-y-5">
            {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
            <div>
              <FormLabel htmlFor="email" required>Email</FormLabel>
              <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClasses} />
            </div>
            <div>
              <FormLabel htmlFor="password" required>Password</FormLabel>
              <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClasses} />
            </div>
            <Button disabled={busy} fullWidth>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </section>
      </main>
    );
  }

  if (authState === "forbidden") {
    return (
      <main className="grid min-h-screen place-items-center bg-surface px-4 py-10">
        <section className="w-full max-w-md rounded-panel bg-surface-container-lowest p-6 shadow-elevation-1 sm:p-9">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-label text-error">ACCESS DENIED</span>
            <h1 className="mt-3 text-3xl font-bold text-on-surface">Insufficient permissions</h1>
            <p className="mt-2 text-sm text-on-surface-variant">Your account does not have permission to access ConnectSphere.</p>
          </div>
          <Button variant="secondary" fullWidth onClick={handleSignOut}>Sign out</Button>
        </section>
      </main>
    );
  }

  if (authState === "coordinator-lead") {
    router.replace("/events");
    return null;
  }

  if (authState === "organiser") {
    router.replace("/dashboard");
    return null;
  }

  return null;
}