"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import * as s from "@/db/schema";
import { getCurrentUser } from "@/lib/dal";
import { CURRENT_MONTH } from "@/lib/forecast";
import { type CloseBlocker, closeBlocker, parseResolution } from "@/lib/month-close";

export type ResolveState =
  | null
  | { ok: true; at: number }
  | { ok: false; error: "forbidden" | "invalid" | "gone" | "failed"; at: number };

/**
 * Finance explains one reconciliation exception. Nothing is corrected: the tracker and the ledger stay as
 * they are, and the explanation is what lets the month close. The row is locked so two people can't both
 * resolve it, and an already-resolved exception isn't overwritten.
 */
export async function resolveException(_prev: ResolveState, fd: FormData): Promise<ResolveState> {
  const at = Date.now();
  const user = await getCurrentUser();
  if (user.role !== "finance") return { ok: false, error: "forbidden", at };
  const itemId = Number(fd.get("itemId"));
  const resolution = parseResolution(fd.get("resolution"));
  if (!Number.isInteger(itemId) || !resolution) return { ok: false, error: "invalid", at };

  try {
    const done = await db.transaction(async (tx) => {
      const [item] = await tx
        .select({ id: s.reconItems.id })
        .from(s.reconItems)
        .where(and(eq(s.reconItems.id, itemId), ne(s.reconItems.kind, "matched"), isNull(s.reconItems.resolvedAt)))
        .for("update");
      if (!item) return false;
      await tx
        .update(s.reconItems)
        .set({ resolution, resolvedBy: user.id, resolvedAt: new Date() })
        .where(eq(s.reconItems.id, itemId));
      return true;
    });
    if (!done) return { ok: false, error: "gone", at };
  } catch (err) {
    console.error("resolveException failed", { itemId, userId: user.id, err });
    return { ok: false, error: "failed", at };
  }
  revalidatePath("/close");
  return { ok: true, at };
}

export type CloseResult = { ok: true } | { ok: false; blocker: CloseBlocker | "forbidden" | "failed" };

/** Finance closes a reconciled month. The rules are rechecked here, against the data, not the page. */
export async function closeMonth(month: number): Promise<CloseResult> {
  const user = await getCurrentUser();
  if (user.role !== "finance") return { ok: false, blocker: "forbidden" };
  if (!Number.isInteger(month)) return { ok: false, blocker: "failed" };

  try {
    const blocker = await db.transaction(async (tx) => {
      // One close at a time, so "previous month is closed" can't change underneath this one.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('month_close'))`);
      const [recon, closes] = await Promise.all([
        tx
          .select({
            month: s.reconItems.fiscalMonth,
            unresolved: sql<number>`count(*) filter (where ${s.reconItems.kind} <> 'matched' and ${s.reconItems.resolvedAt} is null)::int`,
          })
          .from(s.reconItems)
          .groupBy(s.reconItems.fiscalMonth),
        tx.select({ month: s.monthCloses.fiscalMonth }).from(s.monthCloses),
      ]);
      const facts = Array.from({ length: CURRENT_MONTH }, (_, i) => {
        const r = recon.find((x) => x.month === i + 1);
        return { month: i + 1, closed: closes.some((c) => c.month === i + 1), hasLedger: !!r, unresolved: r?.unresolved ?? 0 };
      });
      const why = closeBlocker(facts, month, CURRENT_MONTH);
      if (!why) await tx.insert(s.monthCloses).values({ fiscalMonth: month, closedBy: user.id });
      return why;
    });
    if (blocker) return { ok: false, blocker };
  } catch (err) {
    console.error("closeMonth failed", { month, userId: user.id, err });
    return { ok: false, blocker: "failed" };
  }
  revalidatePath("/", "layout"); // the month's expenses are now locked everywhere
  return { ok: true };
}
