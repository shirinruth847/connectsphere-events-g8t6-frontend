"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { RadioCardGroup, type RadioCardOption } from "@/components/ui/RadioCardGroup";
import { TextField } from "@/components/ui/TextField";
import { signUp } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { SignupAccountType, SignupResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { resolvePostLoginPath } from "@/lib/auth/redirect";
import { ROLE_LABELS } from "@/lib/permissions/roles";
import {
  PASSWORD_REQUIREMENTS,
  SIGNUP_ACCOUNT_TYPES,
  SIGNUP_FIELDS,
  isSignupAccountType,
  validateSignup,
  type SignupField,
  type SignupFieldErrors,
} from "@/lib/validation/signup";

const ACCOUNT_TYPE_DESCRIPTIONS: Record<SignupAccountType, string> = {
  ATTENDEE: "Find events and register to attend.",
  ORGANISER: "Request and plan events with ConnectSphere.",
};

const ACCOUNT_TYPE_OPTIONS: RadioCardOption<SignupAccountType>[] = SIGNUP_ACCOUNT_TYPES.map((value) => ({
  value,
  label: ROLE_LABELS[value],
  description: ACCOUNT_TYPE_DESCRIPTIONS[value],
}));

// Same wording whether or not the email belongs to an account, so the page
// never confirms that an account exists.
const EMAIL_UNAVAILABLE_MESSAGE = "The email cannot be used for registration.";

type SignupFailure = "INVALID_DETAILS" | "RATE_LIMITED" | "NETWORK_ERROR" | "UNKNOWN";

const FAILURE_MESSAGES: Record<SignupFailure, { title: string; body: string }> = {
  INVALID_DETAILS: {
    title: "Please check your details",
    body: "Some details couldn't be accepted. Review the form and try again.",
  },
  RATE_LIMITED: {
    title: "Too many attempts",
    body: "Too many sign-up attempts. Please try again later.",
  },
  NETWORK_ERROR: {
    title: "Connection problem",
    body: "We couldn't reach ConnectSphere. Check your connection and try again.",
  },
  UNKNOWN: {
    title: "Something went wrong",
    body: "We couldn't create your account right now. Please try again.",
  },
};

// editing -> creating (POST /api/auth/signup) -> signingIn (existing login flow).
// signInFailed is terminal: the account exists, so the form is not offered again.
type Phase = "editing" | "creating" | "signingIn" | "signInFailed";

// Keeps only the backend field errors that belong to a field on this form.
function fieldErrorsFrom(fields: Record<string, string> | undefined): SignupFieldErrors {
  const errors: SignupFieldErrors = {};
  for (const field of SIGNUP_FIELDS) {
    const message = fields?.[field];
    if (typeof message === "string" && message) errors[field] = message;
  }
  return errors;
}

export function SignupForm() {
  const auth = useAuth();
  const router = useRouter();

  const [accountType, setAccountType] = useState<SignupAccountType | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<SignupFieldErrors>({});
  const [failure, setFailure] = useState<SignupFailure | null>(null);
  const [phase, setPhase] = useState<Phase>("editing");
  // A new object each time, so asking for the same field twice still refocuses.
  const [focusRequest, setFocusRequest] = useState<{ field: SignupField } | null>(null);

  const accountTypeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Set synchronously, so two submits before the next render still send one request.
  const inFlight = useRef(false);

  // Signed in (just now, or already) -> the backend's home_path for the role.
  useEffect(() => {
    if (auth.status === "authenticated" && auth.user) {
      router.replace(resolvePostLoginPath(null, auth.user));
    }
  }, [auth.status, auth.user, router]);

  // Runs after render, once the fields are enabled again.
  useEffect(() => {
    if (!focusRequest) return;
    const refs = { accountType: accountTypeRef, name: nameRef, email: emailRef, password: passwordRef };
    refs[focusRequest.field].current?.focus();
  }, [focusRequest]);

  const showFieldErrors = (errors: SignupFieldErrors) => {
    setFieldErrors(errors);
    const first = SIGNUP_FIELDS.find((field) => errors[field]);
    if (first) setFocusRequest({ field: first });
    return Boolean(first);
  };

  const clearFieldError = (field: SignupField) => {
    if (fieldErrors[field]) setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;

    setFailure(null);
    const errors = validateSignup({ accountType, name, email, password });
    // The guard also narrows accountType to the allowlist for the request below.
    if (showFieldErrors(errors) || !isSignupAccountType(accountType)) return;

    inFlight.current = true;
    setPhase("creating");

    let created: SignupResponse;
    try {
      created = await signUp({ accountType, name: name.trim(), email: email.trim(), password });
    } catch (error) {
      // Keep the non-sensitive details for another try; never keep the password.
      setPassword("");
      setPhase("editing");
      inFlight.current = false;

      if (error instanceof ApiError) {
        if (error.code === "EMAIL_UNAVAILABLE") {
          showFieldErrors({ email: EMAIL_UNAVAILABLE_MESSAGE });
          return;
        }
        if (error.code === "VALIDATION_FAILED") {
          if (!showFieldErrors(fieldErrorsFrom(error.fields))) setFailure("INVALID_DETAILS");
          return;
        }
        if (error.code === "RATE_LIMITED") {
          setFailure("RATE_LIMITED");
          return;
        }
        if (error.code === "NETWORK_ERROR") {
          setFailure("NETWORK_ERROR");
          return;
        }
      }
      setFailure("UNKNOWN");
      return;
    }

    // The 201 body is not a session: sign in through the existing login flow,
    // which reads the trusted user and home_path from GET /api/auth/me.
    setPhase("signingIn");
    const result = await auth.signIn(created.user?.email ?? email.trim(), password);
    setPassword("");
    if (!result.ok) {
      // inFlight stays set: no second account attempt and no repeated sign-in.
      setPhase("signInFailed");
    }
    // On success the redirect effect above takes over; the button stays busy until then.
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

  if (phase === "signInFailed") {
    return (
      <Card>
        <h1 className="text-2xl font-semibold text-ink">Account created</h1>
        <div className="mt-6 flex flex-col gap-4">
          <AlertBanner tone="success">
            Your account was created, but we couldn&apos;t sign you in automatically. Please sign in.
          </AlertBanner>
          <Link
            href="/login"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Go to log in
          </Link>
        </div>
      </Card>
    );
  }

  const busy = phase !== "editing";
  const busyLabel = phase === "signingIn" ? "Signing you in…" : "Creating your account…";
  const message = failure ? FAILURE_MESSAGES[failure] : null;

  return (
    <Card>
      <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
      <p className="mt-1 text-sm text-ink-muted">All fields are required.</p>

      <div className="mt-6 flex flex-col gap-4">
        {message && (
          <AlertBanner tone={failure === "RATE_LIMITED" ? "warning" : "error"} title={message.title}>
            {message.body}
          </AlertBanner>
        )}

        {/* noValidate: field messages come from validateSignup, consistently across browsers. */}
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4" aria-label="Create your account">
          <RadioCardGroup
            legend="I'm signing up as"
            name="accountType"
            options={ACCOUNT_TYPE_OPTIONS}
            value={accountType}
            onChange={(value) => {
              setAccountType(value);
              clearFieldError("accountType");
            }}
            error={fieldErrors.accountType}
            required
            disabled={busy}
            firstInputRef={accountTypeRef}
          />
          <TextField
            ref={nameRef}
            label="Name"
            name="name"
            autoComplete="name"
            required
            value={name}
            error={fieldErrors.name}
            disabled={busy}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError("name");
            }}
          />
          <TextField
            ref={emailRef}
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            error={fieldErrors.email}
            disabled={busy}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError("email");
            }}
          />
          <TextField
            ref={passwordRef}
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            hint={PASSWORD_REQUIREMENTS}
            value={password}
            error={fieldErrors.password}
            disabled={busy}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError("password");
            }}
          />
          <Button type="submit" loading={busy} className="mt-2 w-full">
            {busy ? busyLabel : "Create account"}
          </Button>
          <p role="status" className="sr-only">
            {busy ? busyLabel : ""}
          </p>
        </form>

        <p className="text-center text-sm text-ink-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Log in
          </Link>
        </p>
      </div>
    </Card>
  );
}
