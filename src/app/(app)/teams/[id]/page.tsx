import { ArrowLeftIcon, XIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BudgetBarChart } from "@/components/dashboard/budget-bar-chart";
import { HeatMap, type HeatRow } from "@/components/dashboard/heat-map";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { lineItemName, LineItemsTable } from "@/components/dashboard/line-items-table";
import { MonthExpenses } from "@/components/dashboard/month-expenses";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";
import { Panel } from "@/components/dashboard/panel";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { SavingsCallout } from "@/components/dashboard/savings-callout";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { canSeeTeam, getCurrentUser } from "@/lib/dal";
import { CURRENT_MONTH, fiscalMonthDate } from "@/lib/forecast";
import { money, percent } from "@/lib/format";
import { getTeamSnapshot } from "@/lib/queries";

const UNBUDGETED_ID = 0; // synthetic row id; real line item ids start at 1

export default async function TeamPage({ params, searchParams }: PageProps<"/teams/[id]">) {
  const user = await getCurrentUser();
  const teamId = Number((await params).id);
  // 404, not 403: don't reveal which team ids exist to someone who can't see them.
  if (!Number.isInteger(teamId) || !canSeeTeam(user, teamId)) notFound();

  const m = Number((await searchParams).month);
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : undefined;

  const snap = await getTeamSnapshot(teamId, month);
  if (!snap) notFound();

  const [t, tDash, tTeams, locale, format] = await Promise.all([
    getTranslations("team"),
    getTranslations("dashboard"),
    getTranslations("teams"),
    getLocale(),
    getFormatter(),
  ]);
  const f = snap.forecast;
  const base = `/teams/${teamId}`;
  const monthLong = (n: number) => format.dateTime(fiscalMonthDate(n), { month: "long" });
  const hasUnbudgeted = snap.unbudgeted.projected > 0;

  // Line items plus, when present, approved unbudgeted spend as its own row.
  const rows = [
    ...snap.lineItems.map((i) => ({ id: i.id, label: lineItemName(i, locale), forecast: i.forecast })),
    ...(hasUnbudgeted ? [{ id: UNBUDGETED_ID, label: t("unbudgeted"), forecast: snap.unbudgeted }] : []),
  ];
  const driver = rows.toSorted((a, b) => a.forecast.variance - b.forecast.variance)[0];
  const heatRows: HeatRow[] = rows.map((r) => ({ id: r.id, label: r.label, months: r.forecast.months, href: (n) => `${base}?month=${n}#month` }));

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header>
        {!user.teamId && (
          <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden />
            {t("back")}
          </Link>
        )}
        <p className="text-sm text-muted-foreground">{t("title")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{tTeams(snap.team.key as keyof Messages["teams"])}</h1>
          <StatusBadge status={f.status} />
        </div>
        <p className="text-sm text-muted-foreground">{tDash("asOf", { month: monthLong(CURRENT_MONTH) })}</p>
        <p className="mt-3 max-w-4xl text-2xl font-semibold tracking-tight text-balance tabular-nums md:text-3xl">
          {tDash("headline", {
            amount: money(format, Math.abs(f.variance)),
            direction: f.variance < 0 ? "over" : "under",
            pct: percent(format, (f.projected - f.budget) / f.budget, true),
          })}
        </p>
        <p className="mt-1 text-base">
          <span className="text-muted-foreground">
            {driver && driver.forecast.variance < 0
              ? t("driver", { item: driver.label, amount: money(format, -driver.forecast.variance) })
              : t("noDriver")}
          </span>
        </p>
      </header>

      <KpiCards f={f} />
      <SavingsCallout items={snap.lineItems} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={t("byItem.title")} description={t("byItem.subtitle", { currency: "USD" })} className="xl:col-span-2">
          <BudgetBarChart
            labelWidth={230}
            data={rows.map((r) => ({ name: r.label, budget: r.forecast.budget, projected: r.forecast.projected, status: r.forecast.status }))}
          />
        </Panel>
        <Panel title={tDash("approvals.title")}>
          <PendingApprovals requests={snap.pending} exposure={f.pendingExposure} user={user} />
        </Panel>
      </div>

      <Panel title={tDash("heat.title")} description={t("month.hint")}>
        <HeatMap rows={heatRows} selectedMonth={month} />
      </Panel>

      {month && snap.monthExpenses && (
        <Panel
          id="month"
          title={t("month.title", { month: monthLong(month) })}
          className="scroll-mt-4"
          action={
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={base} />}>
              <XIcon aria-hidden />
              {t("month.clear")}
            </Button>
          }
        >
          <MonthExpenses expenses={snap.monthExpenses} items={snap.lineItems} />
        </Panel>
      )}

      <Panel title={tDash("monthly.title")} description={t("monthlySubtitle", { currency: "USD" })}>
        <MonthlyChart
          data={f.months.map((mo) => ({
            label: format.dateTime(fiscalMonthDate(mo.month), { month: "short" }),
            plan: mo.plan,
            actual: mo.actual,
            committed: mo.committed,
          }))}
        />
      </Panel>

      <Panel title={t("items.title")}>
        <LineItemsTable items={snap.lineItems} total={f} />
      </Panel>
    </div>
  );
}
