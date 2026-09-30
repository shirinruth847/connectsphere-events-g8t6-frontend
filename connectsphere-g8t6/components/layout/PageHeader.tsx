import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { StatusTone } from "@/lib/status";
import { Chip } from "@/components/shared/Chip";

interface PageHeaderProps {
  eyebrow: string;
  eyebrowTone?: StatusTone;
  title: string;
  description?: ReactNode;
  /** Right-aligned contextual actions. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  eyebrowTone = "primary",
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}
    >
      <div className="flex flex-col items-start gap-1">
        <Chip tone={eyebrowTone}>{eyebrow}</Chip>
        <h1 className="text-headline font-bold text-on-surface md:text-display">{title}</h1>
        {description ? (
          <p className="max-w-[70ch] text-body text-on-surface-variant">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
