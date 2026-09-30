import { cn } from "@/lib/cn";
import { TONE_STYLES, type StatusTone } from "@/lib/status";

export interface FilterPillOption<T extends string> {
  value: T;
  label: string;
  /** Colored dot shown on inactive pills. */
  tone?: StatusTone;
  count?: number;
}

interface FilterPillsProps<T extends string> {
  label: string;
  options: FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Single-select pill row; the active pill is solid primary with its count. */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: FilterPillsProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1", className)}>
      <span aria-hidden className="pr-1 text-label font-bold tracking-caps text-on-surface-variant uppercase">
        {label}:
      </span>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full px-3 text-label font-bold transition-colors duration-150 ease-out pointer-coarse:h-11",
              active
                ? "bg-primary text-on-primary shadow-elevation-1"
                : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container",
            )}
          >
            {!active && option.tone ? (
              <span aria-hidden className={cn("size-2 rounded-full", TONE_STYLES[option.tone].dot)} />
            ) : null}
            {option.label}
            {active && option.count !== undefined ? (
              <span className="text-micro opacity-75">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
