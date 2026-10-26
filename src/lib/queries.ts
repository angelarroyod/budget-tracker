import "server-only";
import { asc, eq } from "drizzle-orm";
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

/** Everything the executive dashboard needs. */
export async function getSiteSnapshot() {
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
  return { site: forecast(d.plans, d.expenses, CURRENT_MONTH), teams, pending: pendingRequests(d) };
}

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
