import { cn } from "@/lib/cn";

/** Shimmer placeholder; size it with className. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-chip bg-linear-to-r from-surface-container-low via-surface-container to-surface-container-low bg-size-[200%_100%] motion-reduce:animate-none",
        className,
      )}
    />
  );
}
