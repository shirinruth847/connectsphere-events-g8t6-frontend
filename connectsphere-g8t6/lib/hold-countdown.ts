// SPM-188 AC8: a hold that expires within 24 hours shows the time left, e.g.
// "Hold expires in 6 hours". Whole hours, rounded down; under an hour, whole
// minutes, rounded up so it never reads "0 minutes". Null for a hold with more
// than 24 hours left or already past its expiry (the backend then says
// "Hold expired"). No imports, so it is unit tested directly.
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const count = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"}`;

export function holdCountdown(expiresAt: string | null | undefined, now: number): string | null {
  if (!expiresAt) return null;
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left) || left <= 0 || left > DAY_MS) return null;
  const hours = Math.floor(left / HOUR_MS);
  return `Hold expires in ${hours >= 1 ? count(hours, "hour") : count(Math.ceil(left / MINUTE_MS), "minute")}`;
}
