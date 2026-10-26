import "server-only";
import { aliasedTable, and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { canDecide, currentStep, type Step } from "./approvals";
import { CURRENT_MONTH, forecast } from "./forecast";

export type TimelineStep = Step & { id: number; approverName: string | null };
export type ApprovalRow = {
  id: number;
  status: "pending" | "approved" | "rejected";
  reason: string;
  createdAt: Date;
  closedAt: Date | null;
  requesterId: number;
  requesterName: string;
  teamId: number;
  teamKey: string;
  expense: typeof s.expenses.$inferSelect;
  steps: TimelineStep[];
  current: TimelineStep | null;
};

const requester = aliasedTable(s.users, "requester");
const approver = aliasedTable(s.users, "approver");

/** Requests (any status) with their expense and full step history. `teamId` scopes to one team. */
async function loadRequests(where: { teamId?: number; requestId?: number }): Promise<ApprovalRow[]> {
  const rows = await db
    .select({ request: s.approvalRequests, expense: s.expenses, teamKey: s.teams.key, requesterName: requester.name })
    .from(s.approvalRequests)
    .innerJoin(s.expenses, eq(s.expenses.id, s.approvalRequests.expenseId))
    .innerJoin(s.teams, eq(s.teams.id, s.expenses.teamId))
    .innerJoin(requester, eq(requester.id, s.approvalRequests.requesterId))
    .where(
      and(
        where.teamId ? eq(s.expenses.teamId, where.teamId) : undefined,
        where.requestId ? eq(s.approvalRequests.id, where.requestId) : undefined,
      ),
    )
    .orderBy(desc(s.approvalRequests.createdAt), desc(s.approvalRequests.id));
  if (rows.length === 0) return [];

  const steps = await db
    .select({ step: s.approvalSteps, approverName: approver.name })
    .from(s.approvalSteps)
    .leftJoin(approver, eq(approver.id, s.approvalSteps.approverId))
    .where(inArray(s.approvalSteps.requestId, rows.map((r) => r.request.id)))
    .orderBy(asc(s.approvalSteps.seq));

  return rows.map(({ request, expense, teamKey, requesterName }) => {
    const mine = steps.filter((st) => st.step.requestId === request.id).map((st) => ({ ...st.step, approverName: st.approverName }));
    return {
      id: request.id,
      status: request.status,
      reason: request.reason,
      createdAt: request.createdAt,
      closedAt: request.closedAt,
      requesterId: request.requesterId,
      requesterName,
      teamId: expense.teamId,
      teamKey,
      expense,
      steps: mine,
      current: currentStep(mine),
    };
  });
}

/**
 * The approvals queue for one viewer. Champions and delegates only ever get their own team's
 * requests (`scopeTeamId`); "mine" is what's waiting on this user right now.
 */
export async function getApprovalQueue(userId: number, scopeTeamId: number | null) {
  const all = await loadRequests({ teamId: scopeTeamId ?? undefined });
  return {
    mine: all.filter((r) => canDecide(r.steps, userId, r.requesterId)),
    pending: all.filter((r) => r.status === "pending"),
    closed: all.filter((r) => r.status !== "pending"),
  };
}

/** How many requests are waiting on this user (sidebar badge). */
export async function countWaitingOn(userId: number) {
  const steps = await db
    .select({ step: s.approvalSteps, requesterId: s.approvalRequests.requesterId })
    .from(s.approvalSteps)
    .innerJoin(s.approvalRequests, eq(s.approvalRequests.id, s.approvalSteps.requestId))
    .where(eq(s.approvalRequests.status, "pending"));
  const byRequest = Map.groupBy(steps, (st) => st.step.requestId);
  let n = 0;
  for (const group of byRequest.values()) {
    if (canDecide(group.map((g) => g.step), userId, group[0].requesterId)) n++;
  }
  return n;
}

/**
 * One request plus what approving it would do to its team's forecast. Returns null when it
 * doesn't exist; callers must check canSeeTeam() on `teamId` before showing it.
 */
export async function getApprovalDetail(requestId: number) {
  const [row] = await loadRequests({ requestId });
  if (!row) return null;

  const [lineItem] = row.expense.lineItemId
    ? await db.select().from(s.lineItems).where(eq(s.lineItems.id, row.expense.lineItemId))
    : [];

  // Impact: team forecast now vs. with this expense approved (pending requests aren't in the forecast).
  const [plans, expenses] = await Promise.all([
    db
      .select({ lineItemId: s.plans.lineItemId, month: s.plans.month, amountCents: s.plans.amountCents })
      .from(s.plans)
      .innerJoin(s.lineItems, eq(s.lineItems.id, s.plans.lineItemId))
      .where(eq(s.lineItems.teamId, row.teamId)),
    db.select().from(s.expenses).where(eq(s.expenses.teamId, row.teamId)),
  ]);
  const now = forecast(plans, expenses, CURRENT_MONTH);
  const ifApproved = forecast(
    plans,
    expenses.map((e) => (e.id === row.expense.id ? { ...e, approval: "approved" as const } : e)),
    CURRENT_MONTH,
  );

  return { ...row, lineItem: lineItem ?? null, impact: { now, ifApproved } };
}
