import { Icon } from "@/components/shared/icon";

interface CapacityBarProps {
  label: string;
  value: number;
  total: number;
  unit?: string;
}

// "n / total unit (p%)" over a bar; at or above capacity it turns red with a lock.
export function CapacityBar({ label, value, total, unit = "" }: CapacityBarProps) {
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  const full = percent >= 100;
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-on-surface-variant">{label}</span>
        <span className={`flex items-center gap-1 font-semibold tabular-nums ${full ? "text-error" : "text-on-surface"}`}>
          {full ? <Icon name="lock" size={16} /> : null}
          {value.toLocaleString()} / {total.toLocaleString()}{unit ? ` ${unit}` : ""} ({percent}%)
          {full ? <span className="sr-only">, at or over capacity</span> : null}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-container-high"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percent, 100)}
        aria-valuetext={`${value} of ${total}${unit ? ` ${unit}` : ""}, ${percent}%`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-[400ms] ease-out motion-reduce:transition-none ${full ? "bg-error" : "bg-primary"}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}
