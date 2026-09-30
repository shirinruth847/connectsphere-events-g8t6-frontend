import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./Icon";

export interface KeyValueItem {
  label: string;
  value: ReactNode;
  icon?: IconName;
}

interface KeyValuePanelProps {
  items: KeyValueItem[];
  className?: string;
}

/** Inset details list: icon + muted label on the left, bold value on the right. */
export function KeyValuePanel({ items, className }: KeyValuePanelProps) {
  return (
    <dl className={cn("flex flex-col gap-2 rounded-control bg-surface-container-low p-3", className)}>
      {items.map((item) => (
        <div key={item.label} className="flex items-start justify-between gap-4">
          <dt className="flex min-h-5 items-center gap-2 text-label font-bold tracking-caps text-on-surface-variant uppercase">
            {item.icon ? (
              <span className="flex w-4 justify-center">
                <Icon name={item.icon} />
              </span>
            ) : null}
            {item.label}
          </dt>
          <dd className="text-right text-body font-bold text-on-surface">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
