"use client";

import type { ReactNode } from "react";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

/** Legacy SPM-180 entry point rendered in main's shared authenticated shell. */
export function CoordinatorShell({ children }: { children: ReactNode; userName?: string; userEmail?: string }) {
  return <DashboardWorkspace role="COORDINATOR_LEAD">{children}</DashboardWorkspace>;
}
