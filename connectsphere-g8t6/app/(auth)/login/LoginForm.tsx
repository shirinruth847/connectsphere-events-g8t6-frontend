"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolvePostLoginPath, sanitizeNextPath } from "@/lib/auth/redirect";
import type { SignInFailure } from "@/lib/auth/session";
import { validateLogin, type LoginFieldErrors } from "@/lib/validation/login";

// One message for unknown email, wrong password and inactive accounts, so the
// page never reveals which credential was wrong (TC-LOGIN-006/007).
const FAILURE_MESSAGES: Record<SignInFailure, { title: string; body: string }> = {
  INVALID_CREDENTIALS: {
    title: "Unable to log in",
    body: "The email or password is incorrect. Please check your details and try again.",
  },
  RATE_LIMITED: {
    title: "Too many attempts",
    body: "Too many login attempts. Please wait a few minutes before trying again.",
  },
  NETWORK_ERROR: {
    title: "Connection problem",
    body: "We couldn't reach ConnectSphere. Check your connection and try again.",
  },
  UNKNOWN: {
    title: "Something went wrong",
    body: "We couldn't log you in right now. Please try again.",
  },
};

export function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Set synchronously, so two submits before the next render still send one request.
  const inFlight = useRef(false);

  // Signed in (just now, or already) -> validated next= or the backend's home_path.
  useEffect(() => {
    if (auth.status === "authenticated" && auth.user) {
      router.replace(resolvePostLoginPath(next, auth.user));
    }
  }, [auth.status, auth.user, next, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;

    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    inFlight.current = true;
    setFailure(null);
    setSubmitting(true);
    const result = await auth.signIn(email.trim(), password);
    if (!result.ok) {
      // Keep the email for another try; never keep the password.
      setPassword("");
      setFailure(result.failure);
      setSubmitting(false);
      inFlight.current = false;
    }
    // On success the effect above redirects; the button stays busy until then.
  };

  if (auth.status === "authenticated") {
    return (
      <Card>
        <p role="status" className="text-center text-sm text-ink-muted">
          Signing you in…
        </p>
      </Card>
    );
  }

  const message = failure ? FAILURE_MESSAGES[failure] : null;

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-ink">Log in</h1>
      <p className="mt-1 text-sm text-ink-muted">Use your ConnectSphere account to continue.</p>

      <div className="mt-6 flex flex-col gap-4">
        {sanitizeNextPath(next) && !message && (
          <AlertBanner tone="info">Please log in to continue to the page you requested.</AlertBanner>
        )}
        {message && (
          <AlertBanner tone={failure === "RATE_LIMITED" ? "warning" : "error"} title={message.title}>
            {message.body}
          </AlertBanner>
        )}

        {/* noValidate: field messages come from validateLogin, consistently across browsers. */}
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="Log in">
          <TextField
            ref={emailRef}
            label="Email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            error={fieldErrors.email}
            disabled={submitting}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldErrors.email) setFieldErrors((previous) => ({ ...previous, email: undefined }));
            }}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            error={fieldErrors.password}
            disabled={submitting}
            onChange={(event) => {
              setPassword(event.target.value);
              if (fieldErrors.password) setFieldErrors((previous) => ({ ...previous, password: undefined }));
            }}
          />
          <Button type="submit" loading={submitting} className="mt-2 w-full">
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </div>
    </Card>
  );
}
