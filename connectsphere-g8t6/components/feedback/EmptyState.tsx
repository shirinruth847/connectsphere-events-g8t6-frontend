import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/shared/Icon";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon = "search", action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-card bg-surface-container-lowest px-5 py-12 text-center shadow-elevation-1",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-control bg-surface-container-low text-on-surface-variant">
        <Icon name={icon} className="scale-125" />
      </span>
      <h2 className="text-title-sm font-bold text-on-surface">{title}</h2>
      <p className="max-w-[60ch] text-body text-on-surface-variant">{description}</p>
      {action}
    </div>
  );
}
