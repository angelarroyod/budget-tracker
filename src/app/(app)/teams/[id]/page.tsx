import { ArrowLeftIcon, ArrowRightIcon, XIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeatLegend, HeatMap, type HeatRow } from "@/components/dashboard/heat-map";
import { lineItemName, LineItemsTable } from "@/components/dashboard/line-items-table";
import { MonthExpenses } from "@/components/dashboard/month-expenses";
import { SectionHeading, SURFACE } from "@/components/dashboard/panel";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { Projection } from "@/components/dashboard/projection";
import { SavingsCallout } from "@/components/dashboard/savings-callout";
import { TeamLands } from "@/components/dashboard/team-lands";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { canDecide } from "@/lib/approvals";
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

  const [t, tDash, tApp, tTeams, locale, format] = await Promise.all([
    getTranslations("team"),
    getTranslations("dashboard"),
    getTranslations("app"),
    getTranslations("teams"),
    getLocale(),
    getFormatter(),
  ]);
  const f = snap.forecast;
  const base = `/teams/${teamId}`;
  const monthLong = (n: number) => format.dateTime(fiscalMonthDate(n), { month: "long" });
  const hasUnbudgeted = snap.unbudgeted.projected > 0;
  const mine = snap.pending.filter((r) => canDecide(r.steps, user.id, r.requesterId)).length;
  const strong = (chunks: React.ReactNode) => <span className="font-semibold text-foreground tabular-nums">{chunks}</span>;

  // Line items plus, when present, approved unbudgeted spend as its own row.
  const rows = [
    ...snap.lineItems.map((i) => ({ id: i.id, label: lineItemName(i, locale), forecast: i.forecast })),
    ...(hasUnbudgeted ? [{ id: UNBUDGETED_ID, label: t("unbudgeted"), forecast: snap.unbudgeted }] : []),
  ];
  const driver = rows.toSorted((a, b) => a.forecast.variance - b.forecast.variance)[0];
  const heatRows: HeatRow[] = rows.map((r) => ({ id: r.id, label: r.label, months: r.forecast.months, href: (n) => `${base}?month=${n}#month` }));

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5">
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-5">
          <div className="flex min-w-0 flex-col gap-1">
            {!user.teamId && (
              <Link href="/" className="mb-1 inline-flex items-center gap-1 self-start text-[13px] leading-[18px] text-muted-foreground hover:text-foreground">
                <ArrowLeftIcon className="size-3.5" aria-hidden />
                {t("back")}
              </Link>
            )}
            <p className="text-[13px] leading-[18px] text-muted-foreground">{tDash("context", { plant: tApp("plant"), month: monthLong(CURRENT_MONTH) })}</p>
            <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{tTeams(snap.team.key as keyof Messages["teams"])}</h1>
          </div>
          {mine > 0 && (
            <Button size="lg" className="h-9 px-3.5" nativeButton={false} render={<Link href="/approvals" />}>
              {tDash("review", { count: mine })}
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[15px] leading-[22px] text-foreground/70">
          <StatusBadge status={f.status} />
          <p className="text-pretty">
            {tDash.rich("summary", {
              amount: money(format, Math.abs(f.variance)),
              direction: f.variance < 0 ? "over" : "under",
              pct: percent(format, (f.projected - f.budget) / f.budget, true),
              b: strong,
            })}{" "}
            {driver && driver.forecast.variance < 0
              ? t.rich("driver", { item: driver.label, amount: money(format, -driver.forecast.variance), b: strong })
              : t("noDriver")}
          </p>
        </div>
      </header>

      <Projection f={f} scope="team" />
      <SavingsCallout items={snap.lineItems} />

      <div className="flex flex-wrap items-start gap-5">
        <TeamLands
          rows={rows}
          total={f}
          title={t("lands.title")}
          subtitle={t("lands.subtitle")}
          nameHeader={t("items.item")}
          totalLabel={t("items.total")}
        />
        <PendingApprovals requests={snap.pending} forecast={f} user={user} />
      </div>

      <section aria-labelledby="heat-title" className={SURFACE}>
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2.5 px-6 pt-5 pb-4">
          <SectionHeading id="heat-title" title={tDash("heat.title")} description={t("heatSubtitle")} />
          <HeatLegend />
        </div>
        <div className="px-6 pb-5">
          <HeatMap rows={heatRows} selectedMonth={month} />
        </div>
      </section>

      {month && snap.monthExpenses && (
        <section id="month" aria-labelledby="month-title" className={`scroll-mt-4 ${SURFACE}`}>
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 px-6 pt-5 pb-3">
            <SectionHeading id="month-title" title={t("month.title", { month: monthLong(month) })} />
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={base} />}>
              <XIcon aria-hidden />
              {t("month.clear")}
            </Button>
          </div>
          <div className="px-4 pb-4">
            <MonthExpenses expenses={snap.monthExpenses} items={snap.lineItems} />
          </div>
        </section>
      )}

      <section aria-labelledby="items-title" className={SURFACE}>
        <div className="px-6 pt-5 pb-3">
          <SectionHeading id="items-title" title={t("items.title")} />
        </div>
        <div className="px-4 pb-4">
          <LineItemsTable items={snap.lineItems} total={f} />
        </div>
      </section>
    </div>
  );
}
