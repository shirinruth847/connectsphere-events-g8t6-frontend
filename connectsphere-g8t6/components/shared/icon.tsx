import type { ReactNode } from "react";

// Outline icons drawn on a 24px grid in the style of Material Symbols Outlined.
// The project has no icon package; add a name here rather than inlining SVGs.
const PATHS = {
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 10h16" /></>,
  schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  venue: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  layout: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 10h17M10 10v10" /></>,
  attendees: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" /></>,
  organisation: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M15 9h.01M9 13h.01M15 13h.01M10 21v-4h4v4" /></>,
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1.5a7 7 0 0 1 14 0V21" /></>,
  registration: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 11h8M8 15h4" /></>,
  accessibility: <><circle cx="12" cy="4.5" r="1.5" /><path d="M5 8.5l7 1.5 7-1.5M12 10v4l-3 6.5M12 14l3 6.5" /></>,
  equipment: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4h4M12 8v4l3 2" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" /></>,
  forum: <><path d="M4 5h11v8H8l-4 3V5Z" /><path d="M15 9h5v10l-3-2.5h-7V13" /></>,
  warning: <><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  "arrow-back": <path d="M19 12H5M11 6l-6 6 6 6" />,
  "arrow-forward": <path d="M5 12h14M13 6l6 6-6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: 16 | 18 | 20;
  className?: string;
  // Leave unset for decorative icons; set it when the icon stands alone.
  label?: string;
}

export function Icon({ name, size = 18, className = "", label }: IconProps) {
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
