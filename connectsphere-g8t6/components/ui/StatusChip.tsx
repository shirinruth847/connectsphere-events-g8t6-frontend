type StatusChipProps = {
  label: string;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
};

const TONES = {
  neutral: "bg-canvas text-ink-muted border-line",
  info: "bg-brand-soft text-brand-strong border-brand/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
};

export function StatusChip({ label, tone = "neutral" }: StatusChipProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {label}
    </span>
  );
}
