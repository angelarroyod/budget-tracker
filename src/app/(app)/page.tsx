import { ArrowRightIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeatLegend, HeatMap } from "@/components/dashboard/heat-map";
import { SectionHeading, SURFACE } from "@/components/dashboard/panel";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { Projection } from "@/components/dashboard/projection";
import { TeamLands } from "@/components/dashboard/team-lands";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { canDecide } from "@/lib/approvals";
import { getCurrentUser, homePath } from "@/lib/dal";
import { CURRENT_MONTH, fiscalMonthDate } from "@/lib/forecast";
import { money, percent } from "@/lib/format";
import { getSiteSnapshot } from "@/lib/queries";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (user.teamId) redirect(homePath(user)); // champions and delegates have no site-wide view

  const [{ site, teams, pending, hotspot }, t, tApp, tTeams, format] = await Promise.all([
    getSiteSnapshot(),
    getTranslations("dashboard"),
    getTranslations("app"),
    getTranslations("teams"),
    getFormatter(),
  ]);
  const teamName = (key: string) => tTeams(key as keyof Messages["teams"]);
  const monthLong = (m: number) => format.dateTime(fiscalMonthDate(m), { month: "long" });
  const driver = teams.toSorted((a, b) => a.forecast.variance - b.forecast.variance)[0];
  const mine = pending.filter((r) => canDecide(r.steps, user.id, r.requesterId)).length;
  const strong = (chunks: React.ReactNode) => <span className="font-semibold text-foreground tabular-nums">{chunks}</span>;

  return (
    <div className="mx-auto flex max-w-[1320px] flex-col gap-5">
      <header className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b pb-5">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[13px] leading-[18px] text-muted-foreground">{t("context", { plant: tApp("plant"), month: monthLong(CURRENT_MONTH) })}</p>
            <h1 className="text-[28px] leading-[34px] font-semibold tracking-[-0.02em]">{t("title")}</h1>
          </div>
          {mine > 0 && (
            <Button size="lg" className="h-9 px-3.5" nativeButton={false} render={<Link href="/approvals" />}>
              {t("review", { count: mine })}
              <ArrowRightIcon data-icon="inline-end" aria-hidden />
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 text-[15px] leading-[22px] text-foreground/70">
          <StatusBadge status={site.status} />
          <p className="text-pretty">
            {t.rich("summary", {
              amount: money(format, Math.abs(site.variance)),
              direction: site.variance < 0 ? "over" : "under",
              pct: percent(format, (site.projected - site.budget) / site.budget, true),
              b: strong,
            })}{" "}
            {driver && driver.forecast.variance < 0
              ? t.rich("driverLink", {
                  team: teamName(driver.key),
                  amount: money(format, -driver.forecast.variance),
                  link: (chunks) => (
                    <Link href={`/teams/${driver.id}`} className="font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                      {chunks}
                    </Link>
                  ),
                })
              : t("noDriver")}
          </p>
        </div>
      </header>

      <Projection f={site} />

      <div className="flex flex-wrap items-start gap-5">
        <TeamLands teams={teams} site={site} />
        <PendingApprovals requests={pending} forecast={site} user={user} />
      </div>

      <section aria-labelledby="heat-title" className={SURFACE}>
        <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2.5 px-6 pt-5 pb-4">
          <SectionHeading id="heat-title" title={t("heat.title")} description={t("heat.subtitle")} />
          <HeatLegend />
        </div>
        <div className="px-6">
          <HeatMap
            rows={teams
              .toSorted((a, b) => b.forecast.budget - a.forecast.budget)
              .map((x) => ({ id: x.id, label: teamName(x.key), months: x.forecast.months, href: (m: number) => `/teams/${x.id}?month=${m}#month` }))}
          />
        </div>
        {hotspot && (
          <div className="mx-6 mt-4 mb-5 flex items-start gap-2.5 rounded-[10px] bg-muted/60 px-3 py-2.5 text-[13px] leading-[19px] text-foreground/70">
            <span className="flex h-5 shrink-0 items-center rounded-[5px] bg-(--status-warning) px-[7px] text-xs font-semibold text-[#0b0b0b] tabular-nums">
              ▲ {percent(format, hotspot.pct)}
            </span>
            <p className="text-pretty">
              {t.rich("heat.callout", {
                team: teamName(hotspot.teamKey),
                month: monthLong(hotspot.month),
                description: hotspot.description,
                amount: money(format, hotspot.amountUsdCents),
                status: hotspot.status,
                b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              })}
            </p>
          </div>
        )}
        {!hotspot && <div className="h-5" />}
      </section>
    </div>
  );
}
