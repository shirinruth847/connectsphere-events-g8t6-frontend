import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

// Material Symbols Outlined glyphs exported from Figma, kept at their exported size.
// Rendered as a mask so the glyph takes `currentColor` and follows the color tokens.
const ICONS = {
  "arrow-drop-down": { width: 7.5, height: 3.75 },
  "arrow-forward": { width: 10.6667, height: 10.6667 },
  "calendar-month": { width: 13.5, height: 15 },
  "calendar-today": { width: 12, height: 13.3333 },
  close: { width: 11.6667, height: 11.6667 },
  "expand-more": { width: 9, height: 5.55 },
  groups: { width: 16, height: 8 },
  "hourglass-bottom": { width: 10.6667, height: 13.3333 },
  "hourglass-top": { width: 10.6667, height: 13.3333 },
  "location-on": { width: 10.6667, height: 13.3333 },
  lock: { width: 10.6667, height: 14 },
  menu: { width: 15, height: 10 },
  schedule: { width: 13.3333, height: 13.3333 },
  search: { width: 15, height: 15 },
  verified: { width: 14.6667, height: 14 },
} as const;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  /** Only for icons that carry meaning on their own; decorative icons stay hidden. */
  label?: string;
  className?: string;
}

export function Icon({ name, label, className }: IconProps) {
  const { width, height } = ICONS[name];
  const mask = `url(/icons/${name}.svg) center / 100% 100% no-repeat`;
  const style: CSSProperties = { width, height, mask, WebkitMask: mask };

  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block shrink-0 bg-current", className)}
      style={style}
    />
  );
}
