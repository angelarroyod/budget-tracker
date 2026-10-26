import { PlusIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ExpenseSheet } from "@/components/expenses/expense-sheet";
import { ExpenseTable } from "@/components/expenses/expense-table";
import { FilterBar, type FilterValues } from "@/components/expenses/filter-bar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { teams as teamsTable } from "@/db/schema";
import { getCurrentUser } from "@/lib/dal";
import { parseStatus } from "@/lib/expense-form";
import { fiscalMonthDate } from "@/lib/forecast";
import { money } from "@/lib/format";
import { EXPENSES_PAGE_SIZE, type ExpenseFilters, getExpenseFormData, getExpenseList } from "@/lib/queries";

const APPROVALS = ["none", "pending", "approved", "rejected"] as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const int = (v: string | undefined, min: number, max: number) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const user = await getCurrentUser();
  const sp = await searchParams;
  const canEdit = (user.role === "champion" || user.role === "delegate") && user.teamId !== null;

  // Champions and delegates are always scoped to their own team, whatever the URL says.
  const filters: ExpenseFilters = {
    teamId: user.teamId ?? int(one(sp.team), 1, 1_000_000),
    month: int(one(sp.month), 1, 12),
    status: parseStatus(one(sp.status) ?? null) ?? undefined,
    approval: APPROVALS.find((a) => a === one(sp.approval)),
    q: one(sp.q)?.trim().slice(0, 100) || undefined,
    page: int(one(sp.page), 1, 10_000) ?? 1,
  };
  const values: FilterValues = {
    team: user.teamId ? undefined : filters.teamId?.toString(),
    month: filters.month?.toString(),
    status: filters.status,
    approval: filters.approval,
    q: filters.q,
  };
  const listParams = new URLSearchParams(Object.entries({ ...values, page: filters.page > 1 ? String(filters.page) : undefined }).filter((e): e is [string, string] => !!e[1]));
  const href = (extra: Record<string, string>) => {
    const p = new URLSearchParams(listParams);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    const qs = p.toString();
    return qs ? `/expenses?${qs}` : "/expenses";
  };
  const closeHref = href({});

  const editId = canEdit ? int(one(sp.edit), 1, 100_000_000) : undefined;
  const isNew = canEdit && one(sp.new) === "1";

  const [list, teamRows, formData, t, tTeams, locale, format] = await Promise.all([
    getExpenseList(filters),
    user.teamId ? Promise.resolve(null) : db.select().from(teamsTable),
    canEdit && (isNew || editId) ? getExpenseFormData(user.teamId!, editId) : Promise.resolve(null),
    getTranslations("expenses"),
    getTranslations("teams"),
    getLocale(),
    getFormatter(),
  ]);
  const pages = Math.max(1, Math.ceil(list.count / EXPENSES_PAGE_SIZE));
  const showSheet = formData && (isNew || formData.editing);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{canEdit ? t("subtitle") : t("readOnly")}</p>
        </div>
        {canEdit && (
          <Button nativeButton={false} render={<Link href={href({ new: "1" })} scroll={false} />}>
            <PlusIcon aria-hidden />
            {t("new")}
          </Button>
        )}
      </header>

      <FilterBar
        values={values}
        teams={teamRows?.map((r) => ({ value: String(r.id), label: tTeams(r.key as keyof Messages["teams"]) })) ?? null}
        months={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: format.dateTime(fiscalMonthDate(i + 1), { month: "long" }) }))}
      />

      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {t("summary", { count: list.count, total: money(format, list.totalUsdCents) })}
          </p>
          {list.rows.length > 0 && (
            <ExpenseTable rows={list.rows} showTeam={!user.teamId} editHref={canEdit ? (id) => href({ edit: String(id) }) : null} />
          )}
          {pages > 1 && (
            <nav className="flex items-center justify-between gap-2 border-t pt-3 text-sm" aria-label={t("page", { page: filters.page, pages })}>
              <Button variant="outline" size="sm" disabled={filters.page <= 1} nativeButton={filters.page <= 1} render={filters.page > 1 ? <Link href={href({ page: String(filters.page - 1) })} /> : undefined}>
                {t("prev")}
              </Button>
              <span className="text-muted-foreground">{t("page", { page: filters.page, pages })}</span>
              <Button variant="outline" size="sm" disabled={filters.page >= pages} nativeButton={filters.page >= pages} render={filters.page < pages ? <Link href={href({ page: String(filters.page + 1) })} /> : undefined}>
                {t("next")}
              </Button>
            </nav>
          )}
        </CardContent>
      </Card>

      {showSheet && (
        <ExpenseSheet
          key={formData.editing?.id ?? "new"}
          expense={formData.editing}
          lineItems={formData.lineItems.map((i) => ({
            id: i.id,
            label: `${locale.startsWith("es") ? i.nameEs : i.nameEn} · ${i.accountCode}`,
            annualPlanCents: i.annualPlanCents,
            annualBookedCents: i.annualBookedCents,
          }))}
          fxRates={formData.fxRates}
          closeHref={closeHref}
        />
      )}
    </div>
  );
}
