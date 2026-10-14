<<<<<<< HEAD
import Image from "next/image";
import { getData } from "../api/events";

export default async function Home() {
  const data = await getData();
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert h-5 w-[100px]"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <pre>{JSON.stringify(data, null, 2)}</pre>
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            To get started, edit the{" "}
            <code className="rounded bg-black/[.06] px-1.5 py-0.5 font-mono text-[0.9em] dark:bg-white/[.08]">
              page.tsx
            </code>{" "}
            file.
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            Looking for a starting point or more instructions? Head over to{" "}
            <a
              href="https://vercel.com/templates?framework=next.js&utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Templates
            </a>{" "}
            or the{" "}
            <a
              href="https://nextjs.org/learn?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              Learning
            </a>{" "}
            center.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert h-[14px] w-4"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={14}
            />
            Deploy Now
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
            href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
            target="_blank"
            rel="noopener noreferrer"
          >
            Documentation
          </a>
        </div>
      </main>
    </div>
  );
}
=======
"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getCurrentUser } from "@/lib/api/events";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";

type AuthState = "loading" | "unauthenticated" | "coordinator-lead" | "organiser" | "forbidden";

export default function Home() {
  const router = useRouter();
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

  async function handleSignOut() {
    await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
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
>>>>>>> c3c1391 ([SR][SPM-180] [REFACTOR] Revamped the UI and other features)
