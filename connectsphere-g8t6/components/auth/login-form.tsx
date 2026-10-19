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
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    void currentUser().then((user) => {
      if (user && alive) router.replace(postLoginPath(user, next));
    }).catch(() => {});
    return () => { alive = false; };
  }, [next, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid: Record<string, string> = {};
    if (!email.trim()) invalid.email = "Email is required.";
    if (!password) invalid.password = "Password is required.";
    setFields(invalid);
    setError("");
    if (Object.keys(invalid).length) return;
    setBusy(true);
    try {
      const client = getSupabaseBrowserClient();
      const { error: authError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw new Error(authError.status === 429 ? "Too many attempts. Please try again later." : "Unable to sign in. Check your email and password.");
      const user = await currentUser();
      if (!user) throw new Error("Unable to sign in. Check your email and password.");
      router.replace(postLoginPath(user, next));
    } catch (caught) {
      setError(caught instanceof SupabaseConfigurationError
        ? caught.message
        : caught instanceof Error ? caught.message : "Sign in failed. Try again.");
    } finally { setPassword(""); setBusy(false); }
  };

  return <form onSubmit={submit} noValidate className="space-y-5">
    {params.get("reason") === "required" && <AlertBanner tone="info">Please log in first to continue.</AlertBanner>}
    {error ? <AlertBanner tone="error">{error}</AlertBanner> : null}
    <div><FormLabel htmlFor="email" required>Email</FormLabel><input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? "email-error" : undefined} className={fieldClasses} />{fields.email && <p id="email-error" role="alert" className="text-sm text-error">{fields.email}</p>}</div>
    <div><FormLabel htmlFor="password" required>Password</FormLabel><input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(fields.password)} aria-describedby={fields.password ? "password-error" : undefined} className={fieldClasses} />{fields.password && <p id="password-error" role="alert" className="text-sm text-error">{fields.password}</p>}</div>
    <Button type="submit" disabled={busy} fullWidth>{busy ? "Signing in…" : "Sign in"}</Button>
    <p className="text-center text-sm text-on-surface-variant">Don&apos;t have an account? <Link href={ROUTES.signup} className="font-semibold text-primary hover:underline">Sign up</Link></p>
  </form>;
}
