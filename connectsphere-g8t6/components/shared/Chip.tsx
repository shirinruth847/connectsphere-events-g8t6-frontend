import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_STYLES, type StatusTone } from "@/lib/status";
import { Icon, type IconName } from "./Icon";

interface ChipProps {
  tone: StatusTone;
  children: ReactNode;
  /** Replaces the leading dot. */
  icon?: IconName;
  className?: string;
}

/** Tinted uppercase pill used for status and eyebrow labels. */
export function Chip({ tone, children, icon, className }: ChipProps) {
  const styles = TONE_STYLES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label font-bold tracking-caps uppercase",
        styles.chip,
        className,
      )}
    >
      {icon ? (
        <Icon name={icon} className="scale-75" />
      ) : (
        <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", styles.dot)} />
      )}
      {children}
    </span>
  );
}
