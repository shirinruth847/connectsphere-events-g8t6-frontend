import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-surface-container-lowest p-4 sm:p-6 ${className}`}>{children}</div>;
}
