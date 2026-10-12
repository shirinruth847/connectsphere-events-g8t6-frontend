"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertBanner, Button, FormLabel, fieldClasses } from "@/components/shared/primitives";
import { getSupabaseBrowserClient, SupabaseConfigurationError } from "@/lib/supabase";

const safeNextPath = (value: string | null) => {
  if (!value) return "/dashboard";
  try {
    const target = new URL(value, window.location.origin);
    return target.origin === window.location.origin
      ? `${target.pathname}${target.search}${target.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = getSupabaseBrowserClient();
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      router.replace(safeNextPath(params.get("next")));
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
    <Button disabled={busy} fullWidth>{busy ? "Signing in…" : "Sign in"}</Button>
  </form>;
}
