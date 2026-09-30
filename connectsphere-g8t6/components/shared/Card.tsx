import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { TONE_STYLES, type StatusTone } from "@/lib/status";

interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Adds the 4px status top border. */
  tone?: StatusTone;
  as?: "div" | "article" | "section";
}

export function Card({ tone, as: Tag = "div", className, ...props }: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-card bg-surface-container-lowest p-5 shadow-elevation-1",
        tone && cn("border-t-4 transition-colors duration-150", TONE_STYLES[tone].border),
        className,
      )}
      {...props}
    />
  );
}
