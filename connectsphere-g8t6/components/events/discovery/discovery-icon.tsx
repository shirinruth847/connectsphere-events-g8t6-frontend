import type { ReactNode } from "react";

// Outline icons on a 24px grid in the style of Material Symbols Outlined. The
// project has no icon package. Same API as the shared Icon proposed in PR #10
// (SPM-33), so the two can be merged once that lands.
const PATHS = {
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 10h16" /></>,
  schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  venue: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  organisation: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" /></>,
  registration: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
} satisfies Record<string, ReactNode>;

export type DiscoveryIconName = keyof typeof PATHS;

interface DiscoveryIconProps {
  name: DiscoveryIconName;
  size?: 16 | 18 | 20;
  className?: string;
  // Leave unset for decorative icons; set it when the icon stands alone.
  label?: string;
}

export function DiscoveryIcon({ name, size = 16, className = "", label }: DiscoveryIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}
