import type { ExpenseStatus } from "../db/schema";

/** SPEC §2.3–2.6. Pure functions over USD cents; callers filter rows to a site, team or line item. */

/** The demo is frozen at October 2026 so the story and numbers stay stable. */
export const CURRENT_MONTH = 10;

export type PlanRow = { lineItemId: number; month: number; amountCents: number };
export type ExpenseRow = {
  lineItemId: number | null; // null = unbudgeted
  fiscalMonth: number;
  status: ExpenseStatus;
  amountUsdCents: number;
  nextFy: boolean;
  approval: "none" | "pending" | "approved" | "rejected";
};

export type Status = "over" | "at_risk" | "on_track";
export type MonthForecast = { month: number; plan: number; booked: number; projected: number };
export type Forecast = {
  budget: number;
  actual: number; // actual + accrued
  committed: number;
  projected: number;
  variance: number; // budget − projected; negative = over
  pendingExposure: number;
  nextFy: number;
  status: Status;
  months: MonthForecast[]; // always 12, index 0 = January
};

/** Past months count what was booked; current and future months assume the plan gets spent unless already exceeded. */
export const projectMonth = (plan: number, booked: number, month: number, currentMonth: number) =>
  month < currentMonth ? booked : Math.max(plan, booked);

export function statusOf(budget: number, actual: number, projected: number): Status {
  if (actual > budget) return "over";
  if (projected > budget) return "at_risk";
  return "on_track";
}

export function forecast(plans: PlanRow[], expenses: ExpenseRow[], currentMonth: number): Forecast {
  // Projection is per line item per month, then summed — so one item's overrun is never hidden
  // by another item's unspent plan in the same month.
  const cells = new Map<string, { month: number; plan: number; booked: number }>();
  const cell = (lineItemId: number | null, month: number) => {
    const key = `${lineItemId ?? "unbudgeted"}:${month}`;
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { month, plan: 0, booked: 0 }));
    return c;
  };

  for (const p of plans) cell(p.lineItemId, p.month).plan += p.amountCents;

  let actual = 0, committed = 0, pendingExposure = 0, nextFy = 0;
  for (const e of expenses) {
    if (e.approval === "rejected") continue;
    if (e.nextFy) {
      nextFy += e.amountUsdCents;
      continue;
    }
    if (e.approval === "pending") {
      pendingExposure += e.amountUsdCents;
      continue;
    }
    cell(e.lineItemId, e.fiscalMonth).booked += e.amountUsdCents;
    if (e.status === "committed") committed += e.amountUsdCents;
    else actual += e.amountUsdCents;
  }

  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, plan: 0, booked: 0, projected: 0 }));
  for (const c of cells.values()) {
    const m = months[c.month - 1];
    m.plan += c.plan;
    m.booked += c.booked;
    m.projected += projectMonth(c.plan, c.booked, c.month, currentMonth);
  }

  const budget = months.reduce((sum, m) => sum + m.plan, 0);
  const projected = months.reduce((sum, m) => sum + m.projected, 0);
  return {
    budget,
    actual,
    committed,
    projected,
    variance: budget - projected,
    pendingExposure,
    nextFy,
    status: statusOf(budget, actual, projected),
    months,
  };
}

export type HeatCell =
  | { kind: "future" }
  | { kind: "empty" } // no plan, nothing booked
  | { kind: "unplanned" } // no plan, but money booked
  | { kind: "pct"; pct: number; over: boolean }; // pct = booked / plan (1 = 100%)

export function heatCell(plan: number, booked: number, month: number, currentMonth: number): HeatCell {
  if (month > currentMonth) return { kind: "future" };
  if (plan === 0) return booked === 0 ? { kind: "empty" } : { kind: "unplanned" };
  const pct = booked / plan;
  return { kind: "pct", pct, over: pct > 1 };
}

/**
 * Unspent plan in closed-out (past) months, netted across those months: a line item that
 * underspent in March but overspent in May shows only the net saving. Call per line item.
 */
export function savings(f: Forecast, currentMonth: number) {
  const net = f.months
    .filter((m) => m.month < currentMonth)
    .reduce((sum, m) => sum + m.plan - m.booked, 0);
  return Math.max(0, net);
}
