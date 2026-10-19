"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { getSupabaseBrowserClient, SupabaseConfigurationError } from "@/lib/supabase";
import { postLoginPath, ROUTES } from "@/lib/auth";
import { currentUser } from "@/lib/session";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void currentUser()
      .then((user) => { if (user && alive) router.replace(postLoginPath(user, next)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [next, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = getSupabaseBrowserClient();
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      const user = await currentUser();
      if (!user) throw new Error("Unable to sign in. Check your email and password.");
      router.replace(postLoginPath(user, next));
    } catch (caught) {
      setError(caught instanceof SupabaseConfigurationError
        ? "Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to .env.local, then restart Next.js."
        : caught instanceof Error ? caught.message : "Sign in failed. Try again.");
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="space-y-5">
    {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
    <div><FormLabel htmlFor="email" required>Email</FormLabel><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClasses} /></div>
    <div><FormLabel htmlFor="password" required>Password</FormLabel><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={fieldClasses} /></div>
    <Button type="submit" disabled={busy} fullWidth>{busy ? "Signing in…" : "Sign in"}</Button>
    <p className="text-center text-sm text-on-surface-variant">Don&apos;t have an account? <Link href={ROUTES.signup} className="font-semibold text-primary hover:underline">Sign up</Link></p>
  </form>;
}
