import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import * as s from "@/db/schema";
import { currentStep, type Step } from "./approvals";
import { CURRENT_MONTH, type Forecast, forecast, savings } from "./forecast";

export type TeamSnapshot = { id: number; key: string; forecast: Forecast };
export type PendingRequest = {
  id: number;
  requesterId: number;
  requesterName: string;
  teamKey: string;
  description: string;
  reason: string;
  amountUsdCents: number;
  amountOrigCents: number;
  currency: "USD" | "MXN";
  createdAt: Date;
  steps: Step[];
  current: Step; // the step waiting for a decision
};
export type LineItemSnapshot = {
  id: number;
  accountCode: string;
  nameEn: string;
  nameEs: string;
  forecast: Forecast;
  savings: number;
};

/**
 * ~600 expense rows: loading them and forecasting in memory is simpler than SQL aggregates and
 * keeps one implementation of the rules (lib/forecast).
 * ponytail: full-table loads; move to SQL group-bys if expenses grow past ~50k rows.
 */
async function loadAll() {
  const [teams, lineItems, plans, expenses, requests, steps, users] = await Promise.all([
    db.select().from(s.teams).orderBy(asc(s.teams.id)),
    db.select().from(s.lineItems).orderBy(asc(s.lineItems.accountCode)),
    db.select().from(s.plans),
    db.select().from(s.expenses),
    db.select().from(s.approvalRequests).where(eq(s.approvalRequests.status, "pending")),
    db.select().from(s.approvalSteps).orderBy(asc(s.approvalSteps.seq)),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users),
  ]);
  return { teams, lineItems, plans, expenses, requests, steps, users };
}
type Data = Awaited<ReturnType<typeof loadAll>>;

function pendingRequests(d: Data, teamId?: number): PendingRequest[] {
  const userName = new Map(d.users.map((u) => [u.id, u.name]));
  const teamKey = new Map(d.teams.map((t) => [t.id, t.key]));
  const expenseById = new Map(d.expenses.map((e) => [e.id, e]));
  return d.requests
    .flatMap((r) => {
      const e = expenseById.get(r.expenseId)!;
      if (teamId !== undefined && e.teamId !== teamId) return [];
      const steps = d.steps.filter((st) => st.requestId === r.id);
      const current = currentStep(steps);
      if (!current) return [];
      return [{
        id: r.id,
        requesterId: r.requesterId,
        requesterName: userName.get(r.requesterId) ?? "",
        teamKey: teamKey.get(e.teamId) ?? "",
        description: e.description,
        reason: r.reason,
        amountUsdCents: e.amountUsdCents,
        amountOrigCents: e.amountOrigCents,
        currency: e.currency,
        createdAt: r.createdAt,
        steps,
        current,
      }];
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Everything the executive dashboard needs. Cached per request: the sidebar's team list reads it too. */
export const getSiteSnapshot = cache(async () => {
  const d = await loadAll();
  const teamOfItem = new Map(d.lineItems.map((i) => [i.id, i.teamId]));
  const teams: TeamSnapshot[] = d.teams.map((t) => ({
    id: t.id,
    key: t.key,
    forecast: forecast(
      d.plans.filter((p) => teamOfItem.get(p.lineItemId) === t.id),
      d.expenses.filter((e) => e.teamId === t.id),
      CURRENT_MONTH,
    ),
  }));

  // The hottest over-plan team-month and the biggest counted expense in it: the heat map's one-line "why".
  const hot = teams
    .flatMap((t) => t.forecast.months.filter((m) => m.month <= CURRENT_MONTH && m.plan > 0 && m.booked > m.plan).map((m) => ({ team: t, month: m.month, pct: m.booked / m.plan })))
    .sort((a, b) => b.pct - a.pct)[0];
  const top = hot && d.expenses
    .filter((e) => e.teamId === hot.team.id && e.fiscalMonth === hot.month && !e.nextFy && (e.approval === "none" || e.approval === "approved"))
    .sort((a, b) => b.amountUsdCents - a.amountUsdCents)[0];
  const hotspot = hot && top
    ? { teamKey: hot.team.key, month: hot.month, pct: hot.pct, status: hot.team.forecast.status, description: top.description, amountUsdCents: top.amountUsdCents }
    : null;

  return { site: forecast(d.plans, d.expenses, CURRENT_MONTH), teams, pending: pendingRequests(d), hotspot };
});

/**
 * One team's dashboard. Returns only that team's rows; callers must already have checked
 * canSeeTeam(). `month` (1–12) adds that month's expense list (the heat-map drill-down).
 */
export async function getTeamSnapshot(teamId: number, month?: number) {
  const d = await loadAll();
  const team = d.teams.find((t) => t.id === teamId);
  if (!team) return null;

  const items = d.lineItems.filter((i) => i.teamId === teamId);
  const itemIds = new Set(items.map((i) => i.id));
  const plans = d.plans.filter((p) => itemIds.has(p.lineItemId));
  const expenses = d.expenses.filter((e) => e.teamId === teamId);

  const lineItems: LineItemSnapshot[] = items.map((i) => {
    const f = forecast(plans.filter((p) => p.lineItemId === i.id), expenses.filter((e) => e.lineItemId === i.id), CURRENT_MONTH);
    return { id: i.id, accountCode: i.accountCode, nameEn: i.nameEn, nameEs: i.nameEs, forecast: f, savings: savings(f, CURRENT_MONTH) };
  });

  return {
    team: { id: team.id, key: team.key },
    forecast: forecast(plans, expenses, CURRENT_MONTH),
    lineItems,
    // Approved spend with no line item (e.g. an emergency purchase). Plan is 0 by definition.
    unbudgeted: forecast([], expenses.filter((e) => e.lineItemId === null), CURRENT_MONTH),
    pending: pendingRequests(d, teamId),
    monthExpenses: month ? expenses.filter((e) => e.fiscalMonth === month).sort((a, b) => b.amountUsdCents - a.amountUsdCents) : null,
  };
}

export const EXPENSES_PAGE_SIZE = 50;
export type ExpenseFilters = {
  teamId?: number; // always set for champions and delegates (by the page, from the session)
  month?: number;
  status?: s.ExpenseStatus;
  approval?: (typeof s.approvalEnum.enumValues)[number];
  q?: string;
  page: number;
};

/** Filtered, paginated expense list. Filtering and paging happen in SQL; the list is the one view that can grow large. */
export async function getExpenseList(f: ExpenseFilters) {
  const q = f.q?.replace(/[\%_]/g, "\$&"); // escape LIKE wildcards in user input
  const where = and(
    f.teamId ? eq(s.expenses.teamId, f.teamId) : undefined,
    f.month ? eq(s.expenses.fiscalMonth, f.month) : undefined,
    f.status ? eq(s.expenses.status, f.status) : undefined,
    f.approval ? eq(s.expenses.approval, f.approval) : undefined,
    q ? or(ilike(s.expenses.description, `%${q}%`), ilike(s.expenses.vendor, `%${q}%`)) : undefined,
  );
  const [rows, [agg]] = await Promise.all([
    db
      .select({
        expense: s.expenses,
        teamKey: s.teams.key,
        lineItemEn: s.lineItems.nameEn,
        lineItemEs: s.lineItems.nameEs,
        createdBy: s.users.name,
      })
      .from(s.expenses)
      .innerJoin(s.teams, eq(s.teams.id, s.expenses.teamId))
      .innerJoin(s.users, eq(s.users.id, s.expenses.createdBy))
      .leftJoin(s.lineItems, eq(s.lineItems.id, s.expenses.lineItemId))
      .where(where)
      .orderBy(desc(s.expenses.fiscalMonth), desc(s.expenses.createdAt), desc(s.expenses.id))
      .limit(EXPENSES_PAGE_SIZE)
      .offset((f.page - 1) * EXPENSES_PAGE_SIZE),
    db
      .select({ count: count(), totalUsd: sql<string>`coalesce(sum(${s.expenses.amountUsdCents}), 0)` })
      .from(s.expenses)
      .where(where),
  ]);
  return { rows, count: agg.count, totalUsdCents: Number(agg.totalUsd) };
}

/**
 * What the add/edit form needs for one team: its line items with annual plan and booked spend
 * (for the client-side "this will need approval" hint), the month FX rates, and the expense
 * being edited. `editId` is ignored unless it belongs to `teamId`.
 */
export async function getExpenseFormData(teamId: number, editId?: number) {
  const [items, planSums, bookedSums, rates, editing] = await Promise.all([
    db.select().from(s.lineItems).where(eq(s.lineItems.teamId, teamId)).orderBy(asc(s.lineItems.accountCode)),
    db
      .select({ lineItemId: s.plans.lineItemId, cents: sql<string>`sum(${s.plans.amountCents})` })
      .from(s.plans)
      .innerJoin(s.lineItems, eq(s.lineItems.id, s.plans.lineItemId))
      .where(eq(s.lineItems.teamId, teamId))
      .groupBy(s.plans.lineItemId),
    db
      .select({ lineItemId: s.expenses.lineItemId, cents: sql<string>`sum(${s.expenses.amountUsdCents})` })
      .from(s.expenses)
      .where(and(eq(s.expenses.teamId, teamId), ...bookedConditions(editId)))
      .groupBy(s.expenses.lineItemId),
    db.select().from(s.fxRates).orderBy(asc(s.fxRates.month)),
    editId
      ? db.select().from(s.expenses).where(and(eq(s.expenses.id, editId), eq(s.expenses.teamId, teamId)))
      : Promise.resolve([]),
  ]);
  const plan = new Map(planSums.map((p) => [p.lineItemId, Number(p.cents)]));
  const booked = new Map(bookedSums.map((b) => [b.lineItemId, Number(b.cents)]));
  return {
    lineItems: items.map((i) => ({
      id: i.id,
      accountCode: i.accountCode,
      nameEn: i.nameEn,
      nameEs: i.nameEs,
      annualPlanCents: plan.get(i.id) ?? 0,
      annualBookedCents: booked.get(i.id) ?? 0,
    })),
    fxRates: rates.map((r) => Number(r.usdMxn)), // index 0 = January
    editing: editing[0] ?? null,
  };
}

/**
 * Spend that counts against this year's plan (SPEC §2.3): not next-FY, not pending or rejected.
 * Excludes `exceptId` so an edited expense isn't counted twice against itself.
 */
export function bookedConditions(exceptId?: number) {
  return [
    eq(s.expenses.nextFy, false),
    inArray(s.expenses.approval, ["none", "approved"]),
    exceptId ? ne(s.expenses.id, exceptId) : undefined,
  ];
}
