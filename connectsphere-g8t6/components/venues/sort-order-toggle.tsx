"use client";

type SortOrder = "asc" | "desc";

// One icon button in place of an "Order" select: a funnel whose arrow points
// the way the list runs. Clicking flips the direction.
export function SortOrderToggle({ order, onChange, id }: { order: SortOrder; onChange: (order: SortOrder) => void; id?: string }) {
  const ascending = order === "asc";
  const label = ascending ? "Ascending order. Switch to descending" : "Descending order. Switch to ascending";
  return (
    <button
      id={id}
      type="button"
      onClick={() => onChange(ascending ? "desc" : "asc")}
      aria-label={label}
      title={ascending ? "Ascending (click for descending)" : "Descending (click for ascending)"}
      data-order={order}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-outline-variant bg-surface-container-lowest text-primary transition-colors duration-150 hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/* Funnel */}
        <path d="M3 5h11l-4.2 5.2V16l-2.6 1.6v-7.4z" />
        {/* Direction arrow */}
        <g className="origin-[18px_12px] transition-transform duration-200" style={{ transform: ascending ? "none" : "rotate(180deg)" }}>
          <path d="M18 18V6" />
          <path d="M15 9l3-3 3 3" />
        </g>
      </svg>
    </button>
  );
}
