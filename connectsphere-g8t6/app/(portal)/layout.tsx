import type { ReactNode } from "react";
import { PortalGate } from "@/components/layout/PortalGate";

// Every route in (portal) requires a backend-verified session.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <PortalGate>{children}</PortalGate>;
}
