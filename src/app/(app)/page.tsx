import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeatMap } from "@/components/dashboard/heat-map";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { MonthlyChart } from "@/components/dashboard/monthly-chart";
import { PendingApprovals } from "@/components/dashboard/pending-approvals";
import { TeamChart } from "@/components/dashboard/team-chart";
import { TeamTable } from "@/components/dashboard/team-table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser, homePath } from "@/lib/dal";
import { CURRENT_MONTH, fiscalMonthDate } from "@/lib/forecast";
import { money, percent } from "@/lib/format";
import { getSiteSnapshot } from "@/lib/queries";

function Panel({ title, description, className, children }: { title: string; description?: string; className?: string; children: React.ReactNode }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (user.teamId) redirect(homePath(user)); // champions and delegates have no site-wide view

  const [{ site, teams, pending }, t, tTeams, format] = await Promise.all([
    getSiteSnapshot(),
    getTranslations("dashboard"),
    getTranslations("teams"),
    getFormatter(),
  ]);
  const teamName = (key: string) => tTeams(key as keyof Messages["teams"]);
  const driver = teams.toSorted((a, b) => a.forecast.variance - b.forecast.variance)[0];

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("asOf", { month: format.dateTime(fiscalMonthDate(CURRENT_MONTH), { month: "long" }) })}
        </p>
        <p className="mt-3 text-lg tabular-nums">
          {t("headline", {
            amount: money(format, Math.abs(site.variance)),
            direction: site.variance < 0 ? "over" : "under",
            pct: percent(format, (site.projected - site.budget) / site.budget, true),
          })}{" "}
          {driver && driver.forecast.variance < 0 ? (
            <Link href={`/teams/${driver.id}`} className="text-muted-foreground underline-offset-4 hover:underline">
              {t("driver", { team: teamName(driver.key), amount: money(format, -driver.forecast.variance) })}
            </Link>
          ) : (
            <span className="text-muted-foreground">{t("noDriver")}</span>
          )}
        </p>
      </header>

      <KpiCards f={site} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title={t("byTeam.title")} description={t("byTeam.subtitle", { currency: "USD" })} className="xl:col-span-2">
          <TeamChart
            data={teams
              .toSorted((a, b) => b.forecast.budget - a.forecast.budget)
              .map((x) => ({ name: teamName(x.key), budget: x.forecast.budget, projected: x.forecast.projected, status: x.forecast.status }))}
          />
        </Panel>
        <Panel title={t("approvals.title")}>
          <PendingApprovals requests={pending} exposure={site.pendingExposure} user={user} />
        </Panel>
      </div>

      <Panel title={t("heat.title")} description={t("heat.subtitle")}>
        <HeatMap teams={teams.toSorted((a, b) => b.forecast.budget - a.forecast.budget)} />
      </Panel>

      <Panel title={t("monthly.title")} description={t("monthly.subtitle", { currency: "USD" })}>
        <MonthlyChart
          data={site.months.map((m) => ({
            label: format.dateTime(fiscalMonthDate(m.month), { month: "short" }),
            plan: m.plan,
            actual: m.actual,
            committed: m.committed,
          }))}
        />
      </Panel>

      <Panel title={t("table.title")}>
        <TeamTable teams={teams} site={site} />
      </Panel>
    </div>
  );
}
