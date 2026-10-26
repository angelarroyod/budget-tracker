"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import * as s from "@/db/schema";
import { buildSteps, needsApproval } from "@/lib/approvals";
import { getCurrentUser } from "@/lib/dal";
import { type FieldErrors, parseExpenseForm, parseStatus } from "@/lib/expense-form";
import { toUsdCents } from "@/lib/fx";
import { bookedConditions } from "@/lib/queries";

export type SaveExpenseState =
  | null
  | { ok: true; approvalRequested: boolean; savedAt: number }
  | { ok: false; errors: FieldErrors; formError?: "forbidden" | "locked" | "failed"; submittedAt: number };

class FormErrors extends Error {
  constructor(readonly errors: FieldErrors, readonly formError?: "forbidden" | "locked") {
    super("form errors");
  }
}

/**
 * Create or edit an expense for the signed-in champion's or delegate's own team.
 *
 * Rules (SPEC §2.1, §2.7):
 * - Rate is locked at entry: an edit keeps the stored rate unless the currency changes.
 * - Unbudgeted, or pushing the line item over its annual plan → expense becomes "pending" and an
 *   approval request is opened (reason required).
 * - Once an expense is in the approval flow (pending/approved), only its status can change, so an
 *   approved amount can't be edited upward afterwards. Rejected expenses are read-only.
 */
export async function saveExpense(_prev: SaveExpenseState, fd: FormData): Promise<SaveExpenseState> {
  const submittedAt = Date.now();
  const user = await getCurrentUser();
  if (!user.teamId || (user.role !== "champion" && user.role !== "delegate")) {
    return { ok: false, errors: {}, formError: "forbidden", submittedAt };
  }
  const teamId = user.teamId;
  const rawId = fd.get("id");
  const editId = rawId ? Number(rawId) : null;

  try {
    const approvalRequested = await db.transaction(async (tx) => {
      const existing = editId
        ? (await tx.select().from(s.expenses).where(eq(s.expenses.id, editId)).for("update"))[0]
        : undefined;
      if (editId && (!existing || existing.teamId !== teamId)) throw new FormErrors({}, "forbidden");
      if (existing?.approval === "rejected") throw new FormErrors({}, "locked");

      const now = new Date();
      if (existing && existing.approval !== "none") {
        const status = parseStatus(fd.get("status"));
        if (!status) throw new FormErrors({ status: "invalid" });
        await tx.update(s.expenses).set({ status, updatedAt: now }).where(eq(s.expenses.id, existing.id));
        return false;
      }

      const parsed = parseExpenseForm(fd);
      if (!parsed.ok) throw new FormErrors(parsed.errors);
      const input = parsed.data;

      if (input.lineItemId !== null) {
        const [item] = await tx
          .select({ id: s.lineItems.id })
          .from(s.lineItems)
          .where(and(eq(s.lineItems.id, input.lineItemId), eq(s.lineItems.teamId, teamId)));
        if (!item) throw new FormErrors({ lineItemId: "invalid" });
      }

      const keepRate = existing && existing.currency === input.currency;
      const rate = keepRate
        ? existing.fxRate
        : (await tx.select().from(s.fxRates).where(eq(s.fxRates.month, input.fiscalMonth)))[0].usdMxn;
      let money;
      try {
        money = toUsdCents(input.amountOrigCents, input.currency, rate);
      } catch {
        throw new FormErrors({ amountOrigCents: "amount" });
      }

      let annualPlanCents = 0;
      let annualBookedCents = 0;
      if (input.lineItemId !== null) {
        const [[plan], [booked]] = await Promise.all([
          tx.select({ c: sql<string>`coalesce(sum(${s.plans.amountCents}), 0)` }).from(s.plans).where(eq(s.plans.lineItemId, input.lineItemId)),
          tx
            .select({ c: sql<string>`coalesce(sum(${s.expenses.amountUsdCents}), 0)` })
            .from(s.expenses)
            .where(and(eq(s.expenses.lineItemId, input.lineItemId), ...bookedConditions(existing?.id))),
        ]);
        annualPlanCents = Number(plan.c);
        annualBookedCents = Number(booked.c);
      }
      const needs = needsApproval({ ...input, amountUsdCents: money.amountUsdCents, annualPlanCents, annualBookedCents });
      if (needs && !input.reason) throw new FormErrors({ reason: "required" });

      const values = {
        teamId,
        lineItemId: input.lineItemId,
        description: input.description,
        vendor: input.vendor,
        fiscalMonth: input.fiscalMonth,
        status: input.status,
        currency: input.currency,
        amountOrigCents: input.amountOrigCents,
        fxRate: money.fxRate,
        amountUsdCents: money.amountUsdCents,
        nextFy: input.nextFy,
        approval: needs ? ("pending" as const) : ("none" as const),
        updatedAt: now,
      };
      const expenseId = existing
        ? (await tx.update(s.expenses).set(values).where(eq(s.expenses.id, existing.id)).returning({ id: s.expenses.id }))[0].id
        : (await tx.insert(s.expenses).values({ ...values, createdBy: user.id }).returning({ id: s.expenses.id }))[0].id;

      if (needs) {
        const [approvers, [settings]] = await Promise.all([
          tx.select({ id: s.users.id, role: s.users.role, teamId: s.users.teamId }).from(s.users),
          tx.select().from(s.settings),
        ]);
        const champion = approvers.find((u) => u.role === "champion" && u.teamId === teamId);
        const executive = approvers.find((u) => u.role === "executive");
        const finance = approvers.find((u) => u.role === "finance");
        if (!champion || !executive || !finance) throw new Error("Approvers missing; run db:seed");

        const steps = buildSteps({
          requesterId: user.id,
          requesterRole: user.role,
          championId: champion.id,
          executiveId: executive.id,
          financeId: finance.id,
          amountUsdCents: money.amountUsdCents,
          financeThresholdCents: settings.financeThresholdCents,
        });
        const [req] = await tx
          .insert(s.approvalRequests)
          .values({ expenseId, requesterId: user.id, reason: input.reason, createdAt: now })
          .returning({ id: s.approvalRequests.id });
        await tx.insert(s.approvalSteps).values(steps.map((st) => ({ ...st, requestId: req.id, decidedAt: null, comment: null })));
      }
      return needs;
    });

    revalidatePath("/", "layout");
    return { ok: true, approvalRequested, savedAt: Date.now() };
  } catch (err) {
    if (err instanceof FormErrors) return { ok: false, errors: err.errors, formError: err.formError, submittedAt };
    console.error("saveExpense failed", { userId: user.id, editId, err });
    return { ok: false, errors: {}, formError: "failed", submittedAt };
  }
}
