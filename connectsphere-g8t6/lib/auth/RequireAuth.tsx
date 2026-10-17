"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthenticatedUser } from "@/lib/api/types";
import { useAuth } from "./AuthProvider";
import { loginUrlFor } from "./redirect";

type RequireAuthProps = {
  children: (user: AuthenticatedUser) => ReactNode;
  // Shown while the session is checked or the redirect to /login runs.
  pending: ReactNode;
  error: (message: string, retry: () => void) => ReactNode;
};

// Route guard for the protected App Router group. Protected content renders
// only after GET /api/auth/me succeeds, so a stale or logged-out browser
// session (including one reached through browser Back) never shows it.
export function RequireAuth({ children, pending, error }: RequireAuthProps) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (auth.status !== "unauthenticated") return;
    const destination = auth.endedBy === "logout" ? "/login" : loginUrlFor(`${pathname}${window.location.search}`);
    router.replace(destination);
  }, [auth.status, auth.endedBy, pathname, router]);

  if (auth.status === "authenticated" && auth.user) {
    // Keyed per user so no component state carries over between accounts.
    return <Fragment key={String(auth.user.user_id)}>{children(auth.user)}</Fragment>;
  }
  if (auth.status === "error") {
    return <>{error(auth.errorMessage ?? "We couldn't check your session.", auth.retry)}</>;
  }
  return <>{pending}</>;
}
