"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { AuthenticatedUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { navigationFor, ROLE_LABELS } from "@/lib/permissions/roles";

export function AppShell({ user, children }: { user: AuthenticatedUser; children: ReactNode }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut();
    // replace() keeps the protected page out of the history stack.
    router.replace("/login");
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <span className="text-lg font-bold tracking-tight text-brand">ConnectSphere</span>
          <nav aria-label="Main" className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
            {navigationFor(user.role).map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${
                    active ? "bg-brand-soft text-brand-strong" : "text-ink-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="text-xs text-ink-muted">{ROLE_LABELS[user.role] ?? user.role}</p>
            </div>
            <Button variant="secondary" onClick={handleLogout} loading={loggingOut}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
