// SPM-40: presentation validation; PostgreSQL repeats it under the event lock.
export function rejectionReasonError(value: string): string | null {
  const reason = value.trim();
  if (!reason) return "Rejection notes are required";
  if (Array.from(reason).length < 10) return "Rejection notes must contain at least 10 characters.";
  if (Array.from(reason).length > 2000 || reason.includes("\0")) return "Use at most 2,000 characters and no null characters.";
  return null;
}
