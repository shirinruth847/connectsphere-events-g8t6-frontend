import { getAvailabilityPresentation } from "./registration-availability";

// Pill with a dot and words, so availability never relies on colour alone.
export function RegistrationAvailabilityChip({ value }: { value: string }) {
  const presentation = getAvailabilityPresentation(value);
  if (!presentation) return null;
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold leading-[14px] tracking-[0.04em] ${presentation.chip}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-pill ${presentation.dot}`} />
      {presentation.label}
    </span>
  );
}
