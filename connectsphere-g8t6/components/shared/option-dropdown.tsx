"use client";

import { useEffect, useId, useRef, useState } from "react";
import { fieldClasses } from "@/components/shared/primitives";

export type DropdownOption = { value: string; label: string };

// A list longer than this gets a search box (SPM-186).
export const DROPDOWN_SEARCH_THRESHOLD = 6;

type CommonProps = {
  id?: string;
  label: string;
  options: DropdownOption[];
  className?: string;
  // Shown on the button when nothing is chosen.
  placeholder?: string;
  // Caps how many options a multiple dropdown may hold.
  max?: number;
};

type SingleProps = CommonProps & { multiple?: false; value: string; onChange: (value: string) => void; allLabel: string };
type MultipleProps = CommonProps & { multiple: true; value: string[]; onChange: (value: string[]) => void };

export const filterOptions = (options: DropdownOption[], text: string) => {
  const needle = text.trim().toLowerCase();
  return needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
};

// A dropdown of options, one ("All …" plus each option) or several
// (checkboxes), searchable once it lists more than six options. It closes on an
// outside click or Escape; that Escape does not close a dialog around it.
export function OptionDropdown(props: SingleProps | MultipleProps) {
  const { label, options, className = "", placeholder, max } = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const buttonId = props.id ?? generatedId;
  const listId = `${buttonId}-options`;
  const chosen = props.multiple ? props.value : props.value ? [props.value] : [];
  const searchable = options.length > DROPDOWN_SEARCH_THRESHOLD;
  const visible = filterOptions(options, search);
  const labelFor = (value: string) => options.find((option) => option.value === value)?.label ?? value;
  const summary = chosen.length
    ? chosen.map(labelFor).join(", ")
    : props.multiple ? (placeholder ?? label) : props.allLabel;

  useEffect(() => {
    if (!open) return;
    const closeOutside = (pointer: PointerEvent) => {
      if (!ref.current?.contains(pointer.target as Node)) setOpen(false);
    };
    const closeOnEscape = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      key.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  const choose = (value: string) => {
    if (props.multiple) return;
    props.onChange(value);
    setOpen(false);
    setSearch("");
  };
  const toggle = (value: string, checked: boolean) => {
    if (!props.multiple) return;
    props.onChange(checked ? [...props.value, value] : props.value.filter((item) => item !== value));
  };
  const full = props.multiple && max !== undefined && props.value.length >= max;
  const optionRow = "flex min-h-9 w-full items-center gap-2 rounded-control px-2 text-left text-sm text-on-surface hover:bg-surface-container-low";

  return (
    <div className={`relative min-w-0 ${className}`} ref={ref}>
      <button
        id={buttonId}
        type="button"
        className={`${fieldClasses} flex items-center justify-between gap-2 py-2 text-left`}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${label}: ${summary}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={`truncate ${chosen.length ? "" : "text-on-surface-variant"}`}>{summary}</span>
        <span aria-hidden="true" className="text-xs text-on-surface-variant">▾</span>
      </button>
      {open ? (
        <div id={listId} className="absolute left-0 z-30 mt-1 grid w-full min-w-60 gap-1 rounded-control border border-outline-variant bg-surface-container-lowest p-2 shadow-elevation-2">
          {searchable ? (
            <input
              type="search"
              autoFocus
              aria-label={`Search ${label.toLowerCase()}`}
              placeholder={`Search ${label.toLowerCase()}`}
              maxLength={100}
              className={`${fieldClasses} min-h-9 py-1.5`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          ) : null}
          {props.multiple ? (
            <fieldset className="grid max-h-60 gap-0.5 overflow-y-auto">
              <legend className="sr-only">{label}</legend>
              {full ? <p className="px-2 text-xs text-on-surface-variant">Up to {max} selected.</p> : null}
              {visible.map((option) => {
                const checked = props.value.includes(option.value);
                return (
                  <label key={option.value} className={`${optionRow} cursor-pointer`}>
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={checked}
                      disabled={!checked && full}
                      onChange={(event) => toggle(option.value, event.target.checked)}
                    />
                    <span className="min-w-0 truncate">{option.label}</span>
                  </label>
                );
              })}
              {visible.length === 0 ? <p className="px-2 py-1 text-sm text-on-surface-variant">No matches.</p> : null}
            </fieldset>
          ) : (
            <ul role="listbox" aria-label={label} className="grid max-h-60 gap-0.5 overflow-y-auto">
              {[{ value: "", label: props.allLabel }, ...visible].map((option) => (
                <li key={option.value || "all"} role="option" aria-selected={props.value === option.value}>
                  <button
                    type="button"
                    className={`${optionRow} ${props.value === option.value ? "font-semibold text-primary" : ""}`}
                    onClick={() => choose(option.value)}
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                  </button>
                </li>
              ))}
              {visible.length === 0 ? <li className="px-2 py-1 text-sm text-on-surface-variant">No matches.</li> : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
