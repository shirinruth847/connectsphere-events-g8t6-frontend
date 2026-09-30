import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const TONES = {
  neutral: "bg-surface-container text-on-surface-variant",
  primary: "bg-surface-container-high text-primary",
} as const;

interface TagProps {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}

/** Small squared label for attributes such as a venue name. */
export function Tag({ children, tone = "neutral", className }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-tag px-2 py-0.5 text-label font-bold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
