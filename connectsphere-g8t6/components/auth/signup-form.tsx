"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertBanner, Button, FormLabel, buttonClasses, fieldClasses } from "@/components/shared/primitives";
import { ApiError, getBackendBaseUrl } from "@/lib/api";
import { postLoginPath, ROLE_LABELS, ROUTES } from "@/lib/auth";
import { currentUser } from "@/lib/session";
import {
  PASSWORD_REQUIREMENTS,
  SIGNUP_ACCOUNT_TYPES,
  SIGNUP_FIELDS,
  isSignupAccountType,
  signupFieldErrors,
  validateSignup,
  type SignupAccountType,
  type SignupField,
  type SignupFieldErrors,
} from "@/lib/signup";
import { getSupabaseBrowserClient } from "@/lib/supabase";

const ACCOUNT_TYPE_DESCRIPTIONS: Record<SignupAccountType, string> = {
  ATTENDEE: "Find events and register to attend.",
  ORGANISER: "Request and plan events with ConnectSphere.",
};

// Same wording whether or not the email belongs to an account, so the page
// never confirms that an account exists.
const EMAIL_UNAVAILABLE_MESSAGE = "The email cannot be used for registration.";

type SignupFailure = "INVALID_DETAILS" | "RATE_LIMITED" | "NETWORK_ERROR" | "UNKNOWN";

const FAILURE_MESSAGES: Record<SignupFailure, { title: string; body: string }> = {
  INVALID_DETAILS: { title: "Please check your details", body: "Some details couldn't be accepted. Review the form and try again." },
  RATE_LIMITED: { title: "Too many attempts", body: "Too many sign-up attempts. Please try again later." },
  NETWORK_ERROR: { title: "Connection problem", body: "We couldn't reach ConnectSphere. Check your connection and try again." },
  UNKNOWN: { title: "Something went wrong", body: "We couldn't create your account right now. Please try again." },
};

// editing -> creating (POST /api/auth/signup) -> signingIn (shared login flow).
// signInFailed is terminal: the account exists, so the form is not offered again.
type Phase = "editing" | "creating" | "signingIn" | "signInFailed";

type SignupRequest = { accountType: SignupAccountType; name: string; email: string; password: string };

// POST /api/auth/signup is public, so it cannot use apiRequest, which requires
// a session. Like lib/session.ts, it calls the backend directly. The body is
// rebuilt so only the four accepted fields are ever sent.
async function requestSignup({ accountType, name, email, password }: SignupRequest) {
  let response: Response;
  try {
    response = await fetch(`${getBackendBaseUrl()}/api/auth/signup`, {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ accountType, name, email, password }),
    });
  } catch {
    throw new ApiError("Network error", 0, "NETWORK_ERROR");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || "Sign-up failed.", response.status, body.code, body.fields);
  return body as { message: string; user?: { email?: string } };
}

const subscribeToNothing = () => () => {};

export function SignupForm() {
  const router = useRouter();
  // False in the prerendered HTML and during hydration. Until React handles
  // submit, the button stays disabled so the browser cannot fall back to a
  // native GET that would put the password in the URL.
  const hydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);

  const [accountType, setAccountType] = useState<SignupAccountType | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<SignupFieldErrors>({});
  const [failure, setFailure] = useState<SignupFailure | null>(null);
  const [phase, setPhase] = useState<Phase>("editing");
  // A new object each time, so asking for the same field twice still refocuses.
  const [focusRequest, setFocusRequest] = useState<{ field: SignupField } | null>(null);

  const accountTypeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Set synchronously, so rapid repeated submits still send one request.
  const inFlight = useRef(false);

  // Already signed in: go to the trusted home, as /login does.
  useEffect(() => {
    let alive = true;
    void currentUser().then(user => { if (user && alive) router.replace(postLoginPath(user, null)); }).catch(() => {});
    return () => { alive = false; };
  }, [router]);

  // Runs after render, once the fields are enabled again.
  useEffect(() => {
    if (!focusRequest) return;
    const refs = { accountType: accountTypeRef, name: nameRef, email: emailRef, password: passwordRef };
    refs[focusRequest.field].current?.focus();
  }, [focusRequest]);

  const showErrors = (next: SignupFieldErrors) => {
    setErrors(next);
    const first = SIGNUP_FIELDS.find((field) => next[field]);
    if (first) setFocusRequest({ field: first });
    return Boolean(first);
  };

  const clearError = (field: SignupField) => {
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;

    setFailure(null);
    // The guard also narrows accountType to the allowlist for the request below.
    if (showErrors(validateSignup({ accountType, name, email, password })) || !isSignupAccountType(accountType)) return;

    inFlight.current = true;
    setPhase("creating");
    const trimmedEmail = email.trim();

    let created: Awaited<ReturnType<typeof requestSignup>>;
    try {
      created = await requestSignup({ accountType, name: name.trim(), email: trimmedEmail, password });
    } catch (error) {
      // Keep the non-sensitive details for another try; never keep the password.
      setPassword("");
      setPhase("editing");
      inFlight.current = false;
      if (error instanceof ApiError) {
        if (error.code === "EMAIL_UNAVAILABLE") { showErrors({ email: EMAIL_UNAVAILABLE_MESSAGE }); return; }
        if (error.code === "VALIDATION_FAILED") {
          if (!showErrors(signupFieldErrors(error.fields))) setFailure("INVALID_DETAILS");
          return;
        }
        if (error.code === "RATE_LIMITED") { setFailure("RATE_LIMITED"); return; }
        if (error.code === "NETWORK_ERROR") { setFailure("NETWORK_ERROR"); return; }
      }
      setFailure("UNKNOWN");
      return;
    }

    // The 201 body carries no session. Sign in exactly as /login does: the
    // shared Supabase client, then the trusted profile from GET /api/auth/me.
    // The chosen account type is never used for routing.
    setPhase("signingIn");
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({
        email: created.user?.email ?? trimmedEmail,
        password,
      });
      if (error) throw error;
      const user = await currentUser();
      if (!user) throw new Error("Profile unavailable");
      router.replace(postLoginPath(user, null));
      // inFlight stays set and the button stays busy until navigation.
    } catch {
      // inFlight stays set: never a second account attempt or repeated sign-in.
      setPhase("signInFailed");
    } finally {
      setPassword("");
    }
  };

  if (phase === "signInFailed") {
    return (
      <div className="space-y-5">
        <AlertBanner tone="success" title="Account created">
          Your account was created successfully, but we couldn&apos;t sign you in automatically. Please sign in.
        </AlertBanner>
        <Link href={ROUTES.login} className={`${buttonClasses("primary")} w-full`}>Go to sign in</Link>
      </div>
    );
  }

  const busy = phase !== "editing";
  const busyLabel = phase === "signingIn" ? "Signing you in…" : "Creating your account…";
  const message = failure ? FAILURE_MESSAGES[failure] : null;
  const describedBy = (field: SignupField, extra?: string) => [extra, errors[field] && `${field}-error`].filter(Boolean).join(" ") || undefined;
  const fieldError = (field: SignupField) =>
    errors[field] ? <p id={`${field}-error`} role="alert" className="mt-1.5 text-sm text-error">{errors[field]}</p> : null;

  return (
    <div className="space-y-5">
      <form onSubmit={submit} noValidate className="space-y-5" aria-label="Create your account">
        {message && <AlertBanner tone={failure === "RATE_LIMITED" ? "warning" : "error"} title={message.title}>{message.body}</AlertBanner>}

        <fieldset aria-describedby={describedBy("accountType")}>
          <legend className="mb-1.5 block text-xs font-semibold text-on-surface">
            I&apos;m signing up as<span aria-hidden="true" className="ml-1 text-error">*</span><span className="sr-only"> (required)</span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {SIGNUP_ACCOUNT_TYPES.map((value, index) => {
              const checked = accountType === value;
              const tone = checked
                ? "border-primary bg-primary-fixed"
                : errors.accountType
                  ? "border-error bg-surface-container-lowest"
                  : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low";
              return (
                <label key={value} htmlFor={`accountType-${value}`} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary has-disabled:cursor-not-allowed has-disabled:opacity-60 ${tone}`}>
                  <input
                    ref={index === 0 ? accountTypeRef : undefined}
                    id={`accountType-${value}`}
                    type="radio"
                    name="accountType"
                    value={value}
                    checked={checked}
                    disabled={busy}
                    // The typed option value is used, never the DOM's string.
                    onChange={() => { setAccountType(value); clearError("accountType"); }}
                    aria-describedby={describedBy("accountType", `accountType-${value}-description`)}
                    className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-none"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-on-surface">{ROLE_LABELS[value]}</span>
                    <span id={`accountType-${value}-description`} className="text-xs text-on-surface-variant">{ACCOUNT_TYPE_DESCRIPTIONS[value]}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {fieldError("accountType")}
        </fieldset>

        <div>
          <FormLabel htmlFor="signup-name" required>Name</FormLabel>
          <input ref={nameRef} id="signup-name" name="name" autoComplete="name" value={name} disabled={busy}
            onChange={e => { setName(e.target.value); clearError("name"); }}
            aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("name")} className={fieldClasses} />
          {fieldError("name")}
        </div>

        <div>
          <FormLabel htmlFor="signup-email" required>Email</FormLabel>
          <input ref={emailRef} id="signup-email" name="email" type="email" inputMode="email" autoComplete="email" value={email} disabled={busy}
            onChange={e => { setEmail(e.target.value); clearError("email"); }}
            aria-invalid={Boolean(errors.email)} aria-describedby={describedBy("email")} className={fieldClasses} />
          {fieldError("email")}
        </div>

        <div>
          <FormLabel htmlFor="signup-password" required>Password</FormLabel>
          <input ref={passwordRef} id="signup-password" name="password" type="password" autoComplete="new-password" value={password} disabled={busy}
            onChange={e => { setPassword(e.target.value); clearError("password"); }}
            aria-invalid={Boolean(errors.password)} aria-describedby={describedBy("password", "signup-password-hint")} className={fieldClasses} />
          <p id="signup-password-hint" className="mt-1.5 text-xs text-on-surface-variant">{PASSWORD_REQUIREMENTS}</p>
          {fieldError("password")}
        </div>

        <Button type="submit" disabled={!hydrated || busy} aria-busy={busy || undefined} fullWidth>{busy ? busyLabel : "Create account"}</Button>
        <p role="status" className="sr-only">{busy ? busyLabel : ""}</p>
      </form>

      <p className="text-center text-sm text-on-surface-variant">
        Already have an account?{" "}
        <Link href={ROUTES.login} className="font-semibold text-primary hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
