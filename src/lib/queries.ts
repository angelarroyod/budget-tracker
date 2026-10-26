import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { currentStep, type Step } from "./approvals";
import { CURRENT_MONTH, type Forecast, forecast } from "./forecast";

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

/**
 * Everything the executive dashboard needs. ~600 expense rows: loading them and forecasting in
 * memory is simpler than SQL aggregates and keeps one implementation of the rules (lib/forecast).
 * ponytail: full-table loads; move to SQL group-bys if expenses grow past ~50k rows.
 */
export async function getSiteSnapshot() {
  const [teamRows, itemRows, planRows, expenseRows, requestRows, stepRows, userRows] = await Promise.all([
    db.select().from(s.teams).orderBy(asc(s.teams.id)),
    db.select({ id: s.lineItems.id, teamId: s.lineItems.teamId }).from(s.lineItems),
    db.select().from(s.plans),
    db.select().from(s.expenses),
    db.select().from(s.approvalRequests).where(eq(s.approvalRequests.status, "pending")),
    db.select().from(s.approvalSteps).orderBy(asc(s.approvalSteps.seq)),
    db.select({ id: s.users.id, name: s.users.name }).from(s.users),
  ]);

  const teamOfItem = new Map(itemRows.map((i) => [i.id, i.teamId]));
  const teams: TeamSnapshot[] = teamRows.map((t) => ({
    id: t.id,
    key: t.key,
    forecast: forecast(
      planRows.filter((p) => teamOfItem.get(p.lineItemId) === t.id),
      expenseRows.filter((e) => e.teamId === t.id),
      CURRENT_MONTH,
    ),
  }));

  const userName = new Map(userRows.map((u) => [u.id, u.name]));
  const teamKey = new Map(teamRows.map((t) => [t.id, t.key]));
  const expenseById = new Map(expenseRows.map((e) => [e.id, e]));
  const pending: PendingRequest[] = requestRows
    .map((r) => {
      const e = expenseById.get(r.expenseId)!;
      const steps = stepRows.filter((st) => st.requestId === r.id);
      return {
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
        current: currentStep(steps)!,
      };
    })
    .filter((r) => r.current)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { site: forecast(planRows, expenseRows, CURRENT_MONTH), teams, pending };
}
