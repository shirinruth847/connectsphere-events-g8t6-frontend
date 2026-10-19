"use client";

import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import type { UserRole } from "@/lib/auth";

/** Apply once per protected page, or once in a shared route layout. */
export function DashboardWorkspace({ children, role }: { children: ReactNode; role?: UserRole }) {
  return <AuthGate role={role}><DashboardShell>{children}</DashboardShell></AuthGate>;
}
