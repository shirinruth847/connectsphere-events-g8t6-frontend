const DATE_TIME = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : DATE_TIME.format(date);
}

export function formatDateRange(start: string | null, end: string | null): string {
  const from = formatDateTime(start);
  const to = formatDateTime(end);
  if (from && to) return `${from} – ${to}`;
  return from ?? to ?? "Date to be confirmed";
}

// "PENDING_CONFIRMATION" -> "Pending confirmation"
export function humanizeCode(code: string): string {
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
