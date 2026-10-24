"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fieldClasses } from "@/components/shared/primitives";

interface VenueMultiSelectProps {
  label: string;
  values: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  invalid?: boolean;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// A dropdown of checkboxes for one venue filter (developer request of 25
// October 2026). Its name shows greyed until something is chosen; a chosen
// value stays listed even if no loaded venue still carries it. It closes on
// an outside click or Escape, and that Escape does not close a popup around it.
export function VenueMultiSelect({ label, values, selected, onChange, invalid = false }: VenueMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const listed = [...selected.filter((value) => !values.some((item) => same(item, value))), ...values];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (pointer: PointerEvent) => {
      if (!ref.current?.contains(pointer.target as Node)) setOpen(false);
    };
    const closeOnEscape = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const toggle = (value: string, checked: boolean) =>
    onChange(checked ? [...selected, value] : selected.filter((item) => !same(item, value)));

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        className={`${fieldClasses} flex items-center justify-between gap-2 py-2 text-left ${invalid ? "border-error" : ""}`}
        aria-label={selected.length ? `${label}: ${selected.join(", ")}` : label}
        aria-expanded={open}
        aria-controls={listId}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`truncate ${selected.length ? "" : "text-outline"}`}>{selected.length ? selected.join(", ") : label}</span>
        <span aria-hidden="true" className="text-xs text-on-surface-variant">▾</span>
      </button>
      {open ? (
        <fieldset id={listId} className="absolute left-0 z-20 mt-1 grid max-h-64 w-full min-w-56 gap-1 overflow-y-auto rounded-control border border-outline-variant bg-surface-container-lowest p-2 shadow-elevation-2">
          <legend className="sr-only">{label}</legend>
          {listed.length ? listed.map((value) => (
            <label key={value} className="flex min-h-9 items-center gap-2 rounded-control px-2 text-sm text-on-surface hover:bg-surface-container-low">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.some((item) => same(item, value))}
                onChange={(changeEvent) => toggle(value, changeEvent.target.checked)}
              />
              {value}
            </label>
          )) : <p className="px-2 py-1 text-sm text-on-surface-variant">None recorded</p>}
        </fieldset>
      ) : null}
    </div>
  );
}
