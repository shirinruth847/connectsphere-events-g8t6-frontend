import { useId, type Ref } from "react";

export type RadioCardOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

type RadioCardGroupProps<T extends string> = {
  legend: string;
  name: string;
  options: readonly RadioCardOption<T>[];
  value: T | null;
  // Receives the option's typed value, never the input's DOM string.
  onChange: (value: T) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  // Attached to the first radio so a form can move focus to the group.
  firstInputRef?: Ref<HTMLInputElement>;
};

// Native radios (arrow keys, Tab and Space work as expected) presented as
// selectable cards. The selection shows as a filled radio and a brand border,
// so it never relies on colour alone.
export function RadioCardGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  required,
  disabled,
  firstInputRef,
}: RadioCardGroupProps<T>) {
  const baseId = useId();
  const errorId = `${baseId}-error`;

  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => {
          const optionId = `${baseId}-${option.value}`;
          const descriptionId = option.description ? `${optionId}-description` : undefined;
          const checked = value === option.value;
          const border = checked ? "border-brand bg-brand-soft" : error ? "border-danger bg-surface" : "border-line bg-surface";

          return (
            <label
              key={option.value}
              htmlFor={optionId}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand has-disabled:cursor-not-allowed has-disabled:opacity-60 ${
                checked ? "" : "hover:bg-canvas"
              } ${border}`}
            >
              <input
                ref={index === 0 ? firstInputRef : undefined}
                type="radio"
                id={optionId}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                required={required}
                disabled={disabled}
                aria-describedby={[descriptionId, error && errorId].filter(Boolean).join(" ") || undefined}
                className="mt-0.5 size-4 shrink-0 accent-brand focus-visible:outline-none"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{option.label}</span>
                {option.description && (
                  <span id={descriptionId} className="text-xs text-ink-muted">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
