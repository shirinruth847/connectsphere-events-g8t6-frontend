"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { ForbiddenState } from "@/components/ui/ApiErrorState";
import { Button } from "@/components/ui/Button";
import { RequireAuth } from "@/lib/auth/RequireAuth";
import { canViewPath } from "@/lib/permissions/roles";
import { AppShell } from "./AppShell";

function CenteredStatus({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">{children}</div>;
}

// Composes the auth guard with the authenticated shell. Role-inappropriate
// pages show a forbidden state; the backend still enforces every request.
export function PortalGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <RequireAuth
      pending={
        <CenteredStatus>
          <p role="status" className="text-center text-sm text-ink-muted">
            Checking your session…
          </p>
        </CenteredStatus>
      }
      error={(message, retry) => (
        <CenteredStatus>
          <AlertBanner tone="error" title="We couldn't check your session" action={<Button onClick={retry}>Try again</Button>}>
            {message}
          </AlertBanner>
        </CenteredStatus>
      )}
    >
      {(user) => (
        <AppShell user={user}>
          {canViewPath(user.role, pathname) ? children : <ForbiddenState homePath={user.home_path} />}
        </AppShell>
      )}
    </RequireAuth>
  );
}
