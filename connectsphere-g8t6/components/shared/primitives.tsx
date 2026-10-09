import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { EventStatus } from "@/lib/events";
import { STATUS_PRESENTATION } from "@/lib/events";

export const buttonClasses = (variant: "primary" | "secondary" | "danger" | "quiet" = "primary") => {
  const variants = {
    primary: "bg-primary text-on-primary hover:bg-primary-container active:bg-primary-dim",
    secondary: "bg-surface-container-low text-primary hover:bg-surface-container-high",
    danger: "bg-error text-on-primary hover:bg-error-on-surface",
    quiet: "bg-transparent text-on-surface-variant hover:bg-surface-container-low",
  };

  return `inline-flex min-h-10 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-55 ${variants[variant]}`;
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "quiet";
  fullWidth?: boolean;
}

export function Button({ variant = "primary", fullWidth, className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`${buttonClasses(variant)} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    />
  );
}

export function StatusChip({ status, label }: { status: EventStatus; label?: string }) {
  const config = STATUS_PRESENTATION[status];
  return (
    <span
      className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${config.chip}`}
    >
      {label || config.label}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-header mb-7 flex flex-wrap items-end justify-between gap-5 rounded-panel bg-surface-container-lowest p-5 shadow-elevation-1 sm:p-7">
      <div className="max-w-3xl">
        <span className="mb-3 inline-flex rounded-pill bg-primary-fixed px-3 py-1 text-[11px] font-semibold uppercase tracking-label text-primary">
          {eyebrow}
        </span>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-on-surface sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-readable text-sm leading-relaxed text-on-surface-variant">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function ReferenceIdTag({ value }: { value: string }) {
  return (
    <span className="inline-flex rounded-tag bg-surface-container-low px-2 py-1 font-mono text-xs text-on-surface-variant">
      {value}
    </span>
  );
}

export function SectionCard({
  children,
  className = "",
  status,
}: {
  children: ReactNode;
  className?: string;
  status?: EventStatus;
}) {
  const statusBorder = status ? STATUS_PRESENTATION[status].border : "border-t-transparent";
  return (
    <section className={`rounded-panel border-t-4 ${statusBorder} bg-surface-container-lowest p-4 shadow-elevation-1 sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export function AlertBanner({
  children,
  tone = "info",
  title,
}: {
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "error";
  title?: string;
}) {
  const tones = {
    info: "border-primary/20 bg-primary-fixed text-on-surface",
    success: "border-success/25 bg-success-container/35 text-on-success-container",
    warning: "border-tertiary/20 bg-tertiary-fixed text-on-tertiary-fixed",
    error: "border-error/25 bg-error-container text-on-error-container",
  };
  return (
    <div className={`rounded-control border p-3 text-sm leading-relaxed ${tones[tone]}`} role={tone === "error" ? "alert" : "status"}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-panel bg-surface-container-low p-6 text-center sm:p-8">
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      <p className="mx-auto mt-2 max-w-readable text-sm leading-relaxed text-on-surface-variant">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-control ${className}`} />;
}

export function FormLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-on-surface" htmlFor={htmlFor}>
      {children}
      {required ? <span aria-hidden="true" className="ml-1 text-error">*</span> : null}
      {required ? <span className="sr-only"> (required)</span> : null}
    </label>
  );
}

export const fieldClasses =
  "min-h-11 w-full rounded-control border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-surface-container";
