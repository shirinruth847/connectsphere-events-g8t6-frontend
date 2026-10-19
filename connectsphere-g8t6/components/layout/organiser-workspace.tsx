"use client";

import { ReactNode } from "react";
import { DashboardWorkspace } from "@/components/layout/dashboard-workspace";

export function OrganiserWorkspace({ children }: { children: ReactNode }) {
  return <DashboardWorkspace role="ORGANISER">{children}</DashboardWorkspace>;
}
