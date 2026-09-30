import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface CapacityBarProps {
  filled: number;
  total: number;
  label?: string;
  /** Right-hand metric; defaults to the occupancy percentage. */
  aside?: ReactNode;
  className?: string;
}

/** "n / total" plus percentage over a bar; turns red with a lock at capacity. */
export function CapacityBar({
  filled,
  total,
  label = "Capacity Allocation",
  aside,
  className,
}: CapacityBarProps) {
  const percent = total > 0 ? Math.min(100, Math.round((filled / total) * 100)) : 0;
  const isFull = total > 0 && filled >= total;

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-chip p-3",
        isFull ? "bg-error-container/30" : "bg-surface-container-low/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-label">
        {isFull ? (
          <p className="flex items-center gap-1 font-bold text-on-error-container">
            <Icon name="lock" />
            {filled} / {total} Seats Allocated (100% Filled)
          </p>
        ) : (
          <p className="font-bold text-on-surface-variant">
            {label}:{" "}
            <span className="text-on-surface">
              {filled} / {total} Seats filled
            </span>
          </p>
        )}
        <p className={cn("font-semibold", isFull ? "text-on-error-container" : "text-primary")}>
          {aside ?? `${percent}% Occupancy`}
        </p>
      </div>
      <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-container">
        <div
          className={cn(
            "h-full origin-left animate-grow-x rounded-full motion-reduce:animate-none",
            isFull ? "bg-error" : "bg-primary",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
