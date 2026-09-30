"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatDay } from "@/lib/format";
import { Button } from "@/components/shared/Button";
import { Icon } from "@/components/shared/Icon";
import { FIELD_SURFACE } from "./field-styles";

/** Inclusive range of YYYY-MM-DD days; empty string means unbounded. */
export interface DateRange {
  from: string;
  to: string;
}

interface DateRangeFieldProps {
  label: string;
  hideLabel?: boolean;
  value: DateRange;
  onChange: (value: DateRange) => void;
  className?: string;
}

function describeRange({ from, to }: DateRange) {
  if (from && to) return `${formatDay(from)} – ${formatDay(to)}`;
  if (from) return `From ${formatDay(from)}`;
  if (to) return `Until ${formatDay(to)}`;
  return "Any date";
}

export function DateRangeField({ label, hideLabel, value, onChange, className }: DateRangeFieldProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const panelId = useId();

  // Light-dismiss: close on outside pointer or Escape, as a native popover would.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        document.getElementById(buttonId)?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, buttonId]);

  return (
    <div ref={rootRef} className={cn("relative flex flex-col gap-1", className)}>
      <span
        id={`${buttonId}-label`}
        className={cn("text-body-sm font-semibold text-on-surface-variant", hideLabel && "sr-only")}
      >
        {label}
      </span>
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={`${buttonId}-label ${buttonId}`}
        onClick={() => setOpen((current) => !current)}
        className={cn(FIELD_SURFACE, "flex cursor-pointer items-center gap-3 pr-3 pl-3.5 text-left")}
      >
        <Icon name="calendar-month" className="text-on-surface-variant" />
        <span className="min-w-0 flex-1 truncate">{describeRange(value)}</span>
        <Icon name="arrow-drop-down" className="text-on-surface-variant" />
      </button>

      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="absolute top-full right-0 left-0 z-20 mt-2 flex animate-panel-in flex-col gap-3 rounded-control bg-surface-container-lowest p-3 shadow-elevation-3 motion-reduce:animate-none sm:right-auto sm:min-w-80"
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-body-sm font-semibold text-on-surface-variant">
              From
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(event) => onChange({ ...value, from: event.target.value })}
                className={cn(FIELD_SURFACE, "px-3")}
              />
            </label>
            <label className="flex flex-col gap-1 text-body-sm font-semibold text-on-surface-variant">
              To
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(event) => onChange({ ...value, to: event.target.value })}
                className={cn(FIELD_SURFACE, "px-3")}
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!value.from && !value.to}
              onClick={() => onChange({ from: "", to: "" })}
            >
              Clear dates
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
