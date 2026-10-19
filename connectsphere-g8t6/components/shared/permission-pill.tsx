import type { ReactNode } from "react";
import { Icon } from "@/components/shared/icon";

const TONES = {
  edit: { className: "bg-primary-fixed text-primary", icon: "edit" },
  "read-only": { className: "bg-surface-container-high text-on-surface-variant", icon: "lock" },
  staff: { className: "bg-tertiary-fixed text-tertiary", icon: "lock" },
} as const;

// States what the viewer may do in a section ("Organisation-wide • Read-only").
export function PermissionPill({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  const config = TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-semibold leading-4 ${config.className}`}>
      <Icon name={config.icon} size={16} />
      {children}
    </span>
  );
}
