/**
 * Month close (SPEC §2.9). Pure rules; persistence and auth live in the server actions.
 *
 * open → reconciled → closed:
 * - open:        the ledger hasn't been reconciled for the month, or some exception has no explanation yet
 * - reconciled:  every exception has been explained by a person (or there were none)
 * - closed:      finance closed it; the month's expenses are locked
 * Only "closed" is stored. "Reconciled" is derived from the exceptions, so the two can't disagree.
 */

export type MonthState = "open" | "reconciled" | "closed";
export type MonthFacts = {
  month: number;
  closed: boolean;
  hasLedger: boolean; // the pipeline has reconciled postings for this month
  unresolved: number; // exceptions with no resolution yet
};
export type CloseBlocker = "current" | "closed" | "noLedger" | "unresolved" | "previousOpen";

export function monthState(f: Omit<MonthFacts, "month">): MonthState {
  if (f.closed) return "closed";
  return f.hasLedger && f.unresolved === 0 ? "reconciled" : "open";
}

/** Why `month` can't be closed yet, or null when it can. Months close in order, and never the one still running. */
export function closeBlocker(months: MonthFacts[], month: number, currentMonth: number): CloseBlocker | null {
  if (month >= currentMonth) return "current";
  const f = months.find((m) => m.month === month);
  if (f?.closed) return "closed";
  if (!f?.hasLedger) return "noLedger";
  if (f.unresolved > 0) return "unresolved";
  if (month > 1 && !months.find((m) => m.month === month - 1)?.closed) return "previousOpen";
  return null;
}

/**
 * A closed month's expenses are locked: nothing can be added to it, and nothing in it can be edited or moved
 * out of it. `fromMonth` is the expense's current month on an edit, `toMonth` the month the form asks for.
 */
export const lockedByClose = (closedMonths: ReadonlySet<number>, toMonth: number, fromMonth?: number) =>
  closedMonths.has(toMonth) || (fromMonth !== undefined && closedMonths.has(fromMonth));

export const RESOLUTION_MAX = 500;

/** A resolution must say something: at least a few words, at most what the column is meant to hold. */
export function parseResolution(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  return text.length >= 10 && text.length <= RESOLUTION_MAX ? text : null;
}
