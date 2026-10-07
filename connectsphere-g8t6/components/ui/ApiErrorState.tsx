import Link from "next/link";
import type { ApiError } from "@/lib/api/client";
import { AlertBanner } from "./AlertBanner";
import { Button } from "./Button";

type ApiErrorStateProps = {
  error: ApiError;
  onRetry: () => void;
  homePath: string;
};

// Maps a normalized backend error onto the matching page state.
export function ApiErrorState({ error, onRetry, homePath }: ApiErrorStateProps) {
  if (error.status === 401) {
    // The auth provider has already ended the session; the guard redirects to /login.
    return <AlertBanner tone="info">Your session has ended. Redirecting you to log in…</AlertBanner>;
  }
  if (error.status === 403) {
    return <ForbiddenState homePath={homePath} />;
  }
  if (error.status === 429) {
    return (
      <AlertBanner
        tone="warning"
        title="Too many requests"
        action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
      >
        Please wait a moment before trying again.
      </AlertBanner>
    );
  }
  return (
    <AlertBanner
      tone="error"
      title="We couldn't load this information"
      action={<Button variant="secondary" onClick={onRetry}>Try again</Button>}
    >
      {error.message}
    </AlertBanner>
  );
}

export function ForbiddenState({ homePath }: { homePath: string }) {
  return (
    <AlertBanner
      tone="warning"
      title="You don't have access to this page"
      action={
        <Link
          href={homePath}
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-canvas"
        >
          Go to your home page
        </Link>
      }
    >
      This area isn&apos;t available for your account.
    </AlertBanner>
  );
}
