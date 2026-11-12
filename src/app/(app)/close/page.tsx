import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExceptionKindBadge, MonthStateBadge } from "@/components/close/badges";
import { CloseMonthButton } from "@/components/close/close-month-button";
import { ResolveForm } from "@/components/close/resolve-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCloseMonths, getExceptions, getRejects } from "@/lib/close-queries";
import { canSeeMonthClose, getCurrentUser } from "@/lib/dal";
import { CURRENT_MONTH, fiscalMonthDate } from "@/lib/forecast";
import { moneyExact } from "@/lib/format";
import { closeBlocker } from "@/lib/month-close";

export default async function MonthClosePage({ searchParams }: PageProps<"/close">) {
  const user = await getCurrentUser();
  if (!canSeeMonthClose(user)) notFound(); // a 404 like other pages a role can't see, not a 403

  const months = await getCloseMonths();
  const requested = Number((await searchParams).month);
  // By default, the month that needs attention (the first one with ledger data that isn't closed), else the
  // latest one with ledger data, so closing a month leaves you looking at it.
  const selected =
    months.find((m) => m.month === requested) ??
    months.find((m) => m.hasLedger && !m.closed) ??
    months.findLast((m) => m.hasLedger) ??
    months[CURRENT_MONTH - 1];

  const [exceptions, rejects, t, tTeams, format] = await Promise.all([
    getExceptions(selected.month),
    getRejects(selected.month),
    getTranslations("close"),
    getTranslations("teams"),
    getFormatter(),
  ]);
  const monthName = (m: number) => format.dateTime(fiscalMonthDate(m), { month: "long" });
  const monthLabel = monthName(selected.month);
  const isFinance = user.role === "finance";
  const blocker = closeBlocker(months, selected.month, CURRENT_MONTH);
  const unresolved = exceptions.filter((e) => !e.resolvedAt).length;
  const num = "text-right tabular-nums";
  const headingId = "selected-month";

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("monthsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("col.month")}</TableHead>
                <TableHead>{t("col.status")}</TableHead>
                <TableHead className="text-right">{t("col.matched")}</TableHead>
                <TableHead className="text-right">{t("col.exceptions")}</TableHead>
                <TableHead className="text-right">{t("col.ledger")}</TableHead>
                <TableHead className="text-right">{t("col.tracker")}</TableHead>
                <TableHead className="text-right">{t("col.difference")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month} aria-current={m.month === selected.month ? "true" : undefined} className="aria-[current=true]:bg-muted/60">
                  <TableCell>
                    <Link href={`/close?month=${m.month}`} className="font-medium capitalize underline-offset-4 hover:underline">
                      {monthName(m.month)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <MonthStateBadge state={m.state} />
                  </TableCell>
                  <TableCell className={num}>{m.hasLedger ? m.matched : "—"}</TableCell>
                  <TableCell className={num}>
                    {m.hasLedger ? (m.unresolved > 0 ? t("unresolvedOf", { unresolved: m.unresolved, total: m.exceptions }) : m.exceptions) : "—"}
                  </TableCell>
                  <TableCell className={num}>{m.hasLedger ? moneyExact(format, m.ledgerUsdCents) : "—"}</TableCell>
                  <TableCell className={num}>{m.hasLedger ? moneyExact(format, m.trackerUsdCents) : "—"}</TableCell>
                  <TableCell className={num}>{m.hasLedger ? moneyExact(format, m.ledgerUsdCents - m.trackerUsdCents, true) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">{t("totalsNote")}</p>
        </CardContent>
      </Card>

      <section aria-labelledby={headingId} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id={headingId} tabIndex={-1} className="text-xl font-semibold capitalize outline-none">
              {t("monthHeading", { month: monthLabel })}
            </h2>
            <MonthStateBadge state={selected.state} />
          </div>
          {isFinance && !blocker && <CloseMonthButton month={selected.month} monthLabel={monthLabel} headingId={headingId} />}
        </div>

        {selected.closed && selected.closedAt ? (
          <p className="text-sm text-muted-foreground">
            {t("closedBy", { name: selected.closedByName ?? "", date: format.dateTime(selected.closedAt, { dateStyle: "medium" }) })}
            {unresolved > 0 && <> {t("newSinceClose", { count: unresolved })}</>}
          </p>
        ) : (
          blocker && blocker !== "closed" && <p className="text-sm text-muted-foreground">{t(`blocker.${blocker}`, { month: monthLabel, count: unresolved })}</p>
        )}
        {!isFinance && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("exceptionsTitle", { count: exceptions.length })}</CardTitle>
          </CardHeader>
          <CardContent>
            {exceptions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{selected.hasLedger ? t("noExceptions") : t("noLedger")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {exceptions.map((e) => {
                  const what = e.expenseDescription ?? e.postingDescription ?? "";
                  const delta = (e.ledgerUsdCents ?? 0) - (e.trackerUsdCents ?? 0);
                  const resolvedId = `exception-${e.id}`;
                  return (
                    <li key={e.id} className="grid gap-4 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                      <div className="flex min-w-0 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <ExceptionKindBadge kind={e.kind as Exclude<typeof e.kind, "matched">} />
                          <span className="text-sm text-muted-foreground">{tTeams(e.teamKey as keyof Messages["teams"])}</span>
                        </div>
                        <p className="font-medium">{what}</p>
                        <p className="text-sm text-muted-foreground">
                          {e.journalId ? t("source.ledger", { journal: e.journalId }) : t("source.tracker", { id: e.expenseId ?? 0, vendor: e.vendor ?? "" })}
                        </p>
                        <dl className="grid w-fit grid-cols-[auto_auto] gap-x-6 gap-y-0.5 text-sm">
                          <dt className="text-muted-foreground">{t("col.tracker")}</dt>
                          <dd className={num}>{e.trackerUsdCents === null ? t("none") : moneyExact(format, e.trackerUsdCents)}</dd>
                          <dt className="text-muted-foreground">{t("col.ledger")}</dt>
                          <dd className={num}>{e.ledgerUsdCents === null ? t("none") : moneyExact(format, e.ledgerUsdCents)}</dd>
                          <dt className="text-muted-foreground">{t("col.difference")}</dt>
                          <dd className={`${num} font-medium`}>{moneyExact(format, delta, true)}</dd>
                        </dl>
                        <p className="text-sm">{t(`hint.${e.kind as Exclude<typeof e.kind, "matched">}`)}</p>
                        {e.rejectDetail && <p className="text-sm">{t("rejectLinked", { detail: e.rejectDetail })}</p>}
                      </div>
                      <div>
                        {e.resolvedAt ? (
                          <div id={resolvedId} tabIndex={-1} className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <p className="font-medium">{t("resolved")}</p>
                            <p>{e.resolution}</p>
                            <p className="text-xs text-muted-foreground">
                              {t("resolvedBy", { name: e.resolvedByName ?? "", date: format.dateTime(e.resolvedAt, { dateStyle: "medium", timeStyle: "short" }) })}
                            </p>
                          </div>
                        ) : isFinance ? (
                          <ResolveForm itemId={e.id} label={what} resolvedId={resolvedId} />
                        ) : (
                          <p className="text-sm text-muted-foreground">{t("awaiting")}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {rejects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("rejectsTitle", { count: rejects.length })}</CardTitle>
              <p className="text-sm text-muted-foreground">{t("rejectsHint")}</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("col.journal")}</TableHead>
                    <TableHead>{t("col.description")}</TableHead>
                    <TableHead>{t("col.reason")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejects.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.journalId ?? "—"}</TableCell>
                      <TableCell className="whitespace-normal">{r.description ?? "—"}</TableCell>
                      <TableCell className="whitespace-normal">
                        <span className="font-medium">{t(`reason.${r.reason}`)}</span>
                        <span className="block text-xs text-muted-foreground">{r.detail}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
