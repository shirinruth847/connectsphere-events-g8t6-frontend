// SPM-41 v2: which history entries are new to this viewer, compared with when
// they last viewed the history (kept per person on the server, replicating
// SPM-181's "last opened" comparison).

export interface HistoryBaseline {
  // When the viewer last viewed the history before this visit; null on a first visit.
  lastViewedAt: string | null;
  // The newest entry shown when this visit began. Entries after it are changes
  // made during the visit (often the viewer's own), so they are not "new".
  newestSeenId: number | null;
}

// A first visit marks nothing as new: every entry would be.
export const isNewHistoryEntry = (
  entry: { historyId: number; occurredAt: string },
  baseline: HistoryBaseline | null,
) => {
  if (!baseline || !baseline.lastViewedAt || baseline.newestSeenId === null) return false;
  const viewedAt = Date.parse(baseline.lastViewedAt);
  const occurredAt = Date.parse(entry.occurredAt);
  if (!Number.isFinite(viewedAt) || !Number.isFinite(occurredAt)) return false;
  return occurredAt > viewedAt && entry.historyId <= baseline.newestSeenId;
};
