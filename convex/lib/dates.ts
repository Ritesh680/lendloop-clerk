// Loan dates are plain calendar days ("YYYY-MM-DD"), which compare correctly as
// strings and carry no time-zone ambiguity. "Today" is evaluated in UTC on the
// server; see the README for why that is an acceptable trade-off for this scale.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export const toIsoDay = (epochMs: number) =>
  new Date(epochMs).toISOString().slice(0, 10);

export const todayUtc = () => toIsoDay(Date.now());

export function isIsoDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  // Rejects impossible days such as 2026-02-31, which Date would roll forward.
  return !Number.isNaN(parsed) && toIsoDay(parsed) === value;
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round(
    (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) /
      DAY_MS,
  );
}

export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && a.endDate >= b.startDate;
}
