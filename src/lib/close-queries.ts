import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { CURRENT_MONTH } from "./forecast";
import { type MonthFacts, monthState, type MonthState } from "./month-close";

export type MonthRow = MonthFacts & {
  state: MonthState;
  matched: number;
  exceptions: number;
  ledgerUsdCents: number;
  trackerUsdCents: number;
  closedByName: string | null;
  closedAt: Date | null;
};

/** Months January → current, with reconciliation counts and close status. Callers check canSeeMonthClose. */
export async function getCloseMonths(): Promise<MonthRow[]> {
  const [recon, ledger, closes] = await Promise.all([
    db
      .select({
        month: s.reconItems.fiscalMonth,
        matched: sql<number>`count(*) filter (where ${s.reconItems.kind} = 'matched')::int`,
        exceptions: sql<number>`count(*) filter (where ${s.reconItems.kind} <> 'matched')::int`,
        unresolved: sql<number>`count(*) filter (where ${s.reconItems.kind} <> 'matched' and ${s.reconItems.resolvedAt} is null)::int`,
        trackerUsdCents: sql<string>`coalesce(sum(${s.reconItems.trackerUsdCents}), 0)`,
      })
      .from(s.reconItems)
      .groupBy(s.reconItems.fiscalMonth),
    db
      .select({ month: s.ledgerPostings.fiscalMonth, cents: sql<string>`sum(${s.ledgerPostings.amountUsdCents})` })
      .from(s.ledgerPostings)
      .groupBy(s.ledgerPostings.fiscalMonth),
    db
      .select({ month: s.monthCloses.fiscalMonth, closedAt: s.monthCloses.closedAt, name: s.users.name })
      .from(s.monthCloses)
      .innerJoin(s.users, eq(s.users.id, s.monthCloses.closedBy)),
  ]);

  return Array.from({ length: CURRENT_MONTH }, (_, i) => {
    const month = i + 1;
    const r = recon.find((x) => x.month === month);
    const close = closes.find((x) => x.month === month);
    const facts = { month, closed: !!close, hasLedger: !!r, unresolved: r?.unresolved ?? 0 };
    return {
      ...facts,
      state: monthState(facts),
      matched: r?.matched ?? 0,
      exceptions: r?.exceptions ?? 0,
      ledgerUsdCents: Number(ledger.find((x) => x.month === month)?.cents ?? 0),
      trackerUsdCents: Number(r?.trackerUsdCents ?? 0),
      closedByName: close?.name ?? null,
      closedAt: close?.closedAt ?? null,
    };
  });
}

export type ExceptionRow = Awaited<ReturnType<typeof getExceptions>>[number];

/** Everything that didn't match in one month, with what's needed to explain it. */
export async function getExceptions(month: number) {
  return db
    .select({
      id: s.reconItems.id,
      kind: s.reconItems.kind,
      teamKey: s.teams.key,
      expenseId: s.reconItems.expenseId,
      expenseDescription: s.expenses.description,
      vendor: s.expenses.vendor,
      journalId: s.ledgerPostings.journalId,
      postingDescription: s.ledgerPostings.description,
      trackerUsdCents: s.reconItems.trackerUsdCents,
      ledgerUsdCents: s.reconItems.ledgerUsdCents,
      rejectDetail: s.ledgerRejects.detail,
      resolution: s.reconItems.resolution,
      resolvedAt: s.reconItems.resolvedAt,
      resolvedByName: s.users.name,
    })
    .from(s.reconItems)
    .innerJoin(s.teams, eq(s.teams.id, s.reconItems.teamId))
    .leftJoin(s.expenses, eq(s.expenses.id, s.reconItems.expenseId))
    .leftJoin(s.ledgerPostings, eq(s.ledgerPostings.id, s.reconItems.postingId))
    .leftJoin(s.ledgerRejects, eq(s.ledgerRejects.id, s.reconItems.rejectId))
    .leftJoin(s.users, eq(s.users.id, s.reconItems.resolvedBy))
    .where(and(eq(s.reconItems.fiscalMonth, month), ne(s.reconItems.kind, "matched")))
    .orderBy(asc(s.reconItems.kind), asc(s.teams.key), asc(s.reconItems.id));
}

/**
 * Ledger rows rejected by validation whose posting date falls in `month`. They were never loaded, so they're
 * fixed at the source (finance corrects the ledger and re-sends), not resolved here.
 */
export async function getRejects(month: number) {
  const postedMonth = sql`case when ${s.ledgerRejects.raw}->>'posting_date' ~ '^[0-9]{4}-[0-9]{2}-'
    then substring(${s.ledgerRejects.raw}->>'posting_date' from 6 for 2)::int end`;
  return db
    .select({
      id: s.ledgerRejects.id,
      journalId: sql<string | null>`${s.ledgerRejects.raw}->>'journal_id'`,
      description: sql<string | null>`${s.ledgerRejects.raw}->>'description'`,
      reason: s.ledgerRejects.reason,
      detail: s.ledgerRejects.detail,
    })
    .from(s.ledgerRejects)
    .where(
      and(
        sql`${postedMonth} = ${month}`,
        // Only the latest file's rejects: a corrected re-send supersedes the rows its predecessor got wrong.
        sql`${s.ledgerRejects.sourceSha256} = (select ${s.ingestRuns.sourceSha256} from ${s.ingestRuns}
          where ${s.ingestRuns.status} = 'succeeded' order by ${s.ingestRuns.id} desc limit 1)`,
      ),
    )
    .orderBy(asc(s.ledgerRejects.rowNumber));
}
