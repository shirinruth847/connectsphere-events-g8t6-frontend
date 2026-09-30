import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/shared/Icon";
import { FIELD_SURFACE } from "./field-styles";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "children"> {
  label: string;
  hideLabel?: boolean;
  options: SelectOption[];
}

/** Native select for full keyboard and screen-reader support, styled as a filled field. */
export function SelectField({
  label,
  hideLabel,
  options,
  className,
  id,
  ...props
}: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label
        htmlFor={selectId}
        className={cn("text-body-sm font-semibold text-on-surface-variant", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className={cn(FIELD_SURFACE, "cursor-pointer appearance-none pr-9 pl-3 text-body-sm font-semibold")}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Icon
          name="expand-more"
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-on-surface-variant"
        />
      </div>
    </div>
  );
}
