import type { ReactNode } from "react";

type AlertBannerProps = {
  tone: "error" | "warning" | "info" | "success";
  title?: string;
  children: ReactNode;
  action?: ReactNode;
};

const TONES = {
  error: "border-danger/30 bg-danger-soft text-danger",
  warning: "border-warning/30 bg-warning-soft text-warning",
  info: "border-brand/30 bg-brand-soft text-brand-strong",
  success: "border-success/30 bg-success-soft text-success",
};

export function AlertBanner({ tone, title, children, action }: AlertBannerProps) {
  // Errors interrupt screen readers; other tones are announced politely.
  const role = tone === "error" ? "alert" : "status";
  return (
    <div role={role} className={`flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-center ${TONES[tone]}`}>
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {action}
    </div>
  );
}
