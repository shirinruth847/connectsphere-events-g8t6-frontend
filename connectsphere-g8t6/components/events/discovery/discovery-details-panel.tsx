import type { ReactNode } from "react";
import { DiscoveryIcon, type DiscoveryIconName } from "./discovery-icon";

export interface DiscoveryDetailRow {
  label: string;
  value: ReactNode;
  icon: DiscoveryIconName;
}

// Inset key-value panel: icon and uppercase label on the left, bold value on
// the right. On narrow screens each value moves under its label.
export function DiscoveryDetailsPanel({ rows }: { rows: DiscoveryDetailRow[] }) {
  return (
    <dl className="grid gap-3 rounded-control bg-surface-container-low p-3 sm:gap-2 sm:p-4">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <dt className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
            <DiscoveryIcon name={row.icon} className="text-primary" />
            {row.label}
          </dt>
          <dd className="text-sm font-semibold text-on-surface [overflow-wrap:anywhere] sm:max-w-[60%] sm:text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
