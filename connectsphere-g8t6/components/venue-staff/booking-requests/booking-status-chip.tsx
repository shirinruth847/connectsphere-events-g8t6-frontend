// Booking states are not event states, so they have their own colours. The
// label is the backend's statusLabel.
const BOOKING_CHIPS: Record<string, string> = {
  HELD: "bg-[#FEF3C7] text-[#92400E]",
  PENDING: "bg-[#EEF2FF] text-[#4338CA]",
  APPROVED: "bg-[#DCFCE7] text-[#166534]",
  REJECTED: "bg-[#FEE2E2] text-[#991B1B]",
  EXPIRED: "bg-[#F3F4F6] text-[#4B5563]",
  RELEASED: "bg-[#F3F4F6] text-[#4B5563]",
  CANCELLED: "bg-[#F3F4F6] text-[#4B5563]",
};

export const BOOKING_BORDERS: Record<string, string> = {
  PENDING: "border-t-[#4338CA]",
  APPROVED: "border-t-[#166534]",
  REJECTED: "border-t-[#991B1B]",
};

export function BookingStatusChip({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex w-fit items-center rounded-chip px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${BOOKING_CHIPS[status] ?? "bg-slate-100 text-slate-700"}`}>
      {label}
    </span>
  );
}
