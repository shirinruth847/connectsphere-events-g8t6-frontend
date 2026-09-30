import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/shared/Icon";
import { FIELD_SURFACE } from "./field-styles";

interface SearchFieldProps extends Omit<ComponentProps<"input">, "type"> {
  label: string;
  /** Keep the label for screen readers only, for compact toolbars. */
  hideLabel?: boolean;
}

export function SearchField({ label, hideLabel, className, id, ...props }: SearchFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={inputId}
        className={cn("text-body-sm font-semibold text-on-surface-variant", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-on-surface-variant"
        />
        <input id={inputId} type="search" className={cn(FIELD_SURFACE, "pr-3 pl-10")} {...props} />
      </div>
    </div>
  );
}
