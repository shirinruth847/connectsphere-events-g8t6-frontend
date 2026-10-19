import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/shared/icon";

export interface KeyValueRow {
  label: string;
  value: ReactNode;
  icon?: IconName;
}

// Inset detail panel: icon and uppercase label on the left, bold value on the right.
// In narrow containers (a side rail, a phone) each value moves under its label.
export function KeyValuePanel({ rows, className = "" }: { rows: KeyValueRow[]; className?: string }) {
  return (
    <div className={`@container rounded-control bg-surface-container-low p-3 sm:p-4 ${className}`}>
      <dl className="grid gap-3 @sm:gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-7 flex-col gap-1 @sm:flex-row @sm:items-start @sm:justify-between @sm:gap-4">
            <dt className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-on-surface-variant">
              {row.icon ? <Icon name={row.icon} size={16} className="text-primary" /> : null}
              {row.label}
            </dt>
            <dd className="text-sm font-semibold text-on-surface [overflow-wrap:break-word] @sm:max-w-[60%] @sm:text-right">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
