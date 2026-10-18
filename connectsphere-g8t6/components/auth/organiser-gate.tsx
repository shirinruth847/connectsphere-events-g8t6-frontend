"use client";
import type { ReactNode } from "react";
import { AuthGate, useSessionUser } from "@/components/auth/auth-gate";
export const useOrganiserProfile = (): { name: string; email: string; avatarUrl?: string } => useSessionUser() ?? { name: "Signed-in user", email: "" };
export function OrganiserGate({ children }: { children: ReactNode }) {
  return <AuthGate role="ORGANISER">{children}</AuthGate>;
}
