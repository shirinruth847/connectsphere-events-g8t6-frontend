"use client";

import type { ReactNode } from "react";
import { Button, fieldClasses } from "@/components/shared/primitives";
import { SortOrderToggle } from "@/components/venues/sort-order-toggle";

export type SortOrder = "asc" | "desc";
export type FilterOption = { value: string; label: string };

// Fields in a toolbar row keep their own width instead of filling it.
export const compactField = fieldClasses.replace("w-full", "");

export function FilterSelect({ id, label, value, options, allLabel, width, onChange }: {
  id: string;
  label: string;
  value: string;
  options: FilterOption[];
  allLabel?: string;
  width: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-on-surface-variant">{label}</label>
      <select id={id} className={`${compactField} ${width}`} value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel !== undefined ? <option value="">{allLabel}</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  );
}

// The search, filter and sort row used by the Venue Staff lists (SPM-181),
// shared by the coordinator and Lead dashboards (developer request, 1 November
// 2026). Results update as the user types; Clear resets every control.
export function ListToolbar({ id, label, search, onSearch, placeholder, sort, children, onClear, canClear }: {
  id: string;
  label: string;
  search: string;
  onSearch: (value: string) => void;
  placeholder: string;
  sort: { value: string; options: FilterOption[]; onChange: (value: string) => void; order: SortOrder; onOrderChange: (order: SortOrder) => void };
  // The filters between the search and the sort.
  children?: ReactNode;
  onClear: () => void;
  canClear: boolean;
}) {
  return (
    <section aria-label={label} className="flex flex-wrap items-end gap-x-3 gap-y-2 rounded-panel bg-surface-container-lowest p-3 shadow-elevation-1">
      <div className="grid min-w-[14rem] flex-1 gap-1">
        <label htmlFor={`${id}-search`} className="text-xs font-semibold text-on-surface-variant">Search</label>
        <input
          id={`${id}-search`}
          type="search"
          className={fieldClasses}
          placeholder={placeholder}
          maxLength={200}
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          aria-describedby={`${id}-search-hint`}
        />
        <span id={`${id}-search-hint`} className="sr-only">Results update as you type.</span>
      </div>
      {children}
      <div className="flex items-end gap-1">
        <FilterSelect id={`${id}-sort`} label="Sort by" value={sort.value} options={sort.options} width="w-[11.5rem]" onChange={sort.onChange} />
        <SortOrderToggle order={sort.order} onChange={sort.onOrderChange} />
      </div>
      <Button variant="quiet" className="px-3" disabled={!canClear} onClick={onClear}>Clear</Button>
    </section>
  );
}

// Case-insensitive match of every typed word against any of the texts.
export const matchesSearch = (search: string, texts: Array<string | null | undefined>) => {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = texts.filter(Boolean).join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word));
};

// Compares two values for a sort; missing values go last whatever the order.
export const compareValues = (left: string | number | null | undefined, right: string | number | null | undefined, order: SortOrder) => {
  if (left == null || left === "") return right == null || right === "" ? 0 : 1;
  if (right == null || right === "") return -1;
  const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
  return order === "asc" ? result : -result;
};
