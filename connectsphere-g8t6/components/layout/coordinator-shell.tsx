"use client";

import type { ReactNode } from "react";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

/** Compatibility wrapper for SPM-177 pages; navigation is shared with main. */
export function CoordinatorShell({ children }: { children: ReactNode; userName?: string; userEmail?: string }) {
  return <DashboardWorkspace role="COORDINATOR_LEAD">{children}</DashboardWorkspace>;
}
