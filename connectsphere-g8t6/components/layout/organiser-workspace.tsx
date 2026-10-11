"use client";

import { ReactNode } from "react";
import { OrganiserGate } from "@/components/auth/organiser-gate";
import { OrganiserShell } from "@/components/layout/organiser-shell";

export function OrganiserWorkspace({ children }: { children: ReactNode }) {
  return <OrganiserGate><OrganiserShell>{children}</OrganiserShell></OrganiserGate>;
}
