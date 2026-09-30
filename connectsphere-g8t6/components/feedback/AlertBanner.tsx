import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/shared/Icon";

interface AlertBannerProps {
  title: string;
  children: ReactNode;
  icon?: IconName;
  action?: ReactNode;
  className?: string;
}

/** Full-width blocking alert: red icon tile, bold title, description and a call to action. */
export function AlertBanner({ title, children, icon = "lock", action, className }: AlertBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-4 rounded-card bg-error-container/60 p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-error text-on-error">
        <Icon name={icon} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-title-sm font-bold text-on-error-container">{title}</p>
        <div className="text-body text-on-surface-variant">{children}</div>
      </div>
      {action}
    </div>
  );
}
