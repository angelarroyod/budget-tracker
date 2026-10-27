import { getFormatter, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Forecast } from "@/lib/forecast";
import { money, percent } from "@/lib/format";

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight tabular-nums md:text-3xl">{value}</p>
        {children && <div className="mt-1.5 text-xs text-muted-foreground">{children}</div>}
      </CardContent>
    </Card>
  );
}

/** Three numbers answer "where will we land"; the spend-to-date breakdown sits underneath at a lower weight. */
export async function KpiCards({ f }: { f: Forecast }) {
  const [t, format] = await Promise.all([getTranslations("dashboard.kpi"), getFormatter()]);
  const secondary = [
    { label: t("actual"), value: money(format, f.actual), hint: t("actualHint", { pct: percent(format, f.actual / f.budget) }) },
    { label: t("committed"), value: money(format, f.committed), hint: t("committedHint") },
    { label: t("nextFy"), value: money(format, f.nextFy), hint: t("nextFyHint") },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Kpi label={t("projected")} value={money(format, f.projected)}>
          <StatusBadge status={f.status} />
        </Kpi>
        <Kpi label={t("variance")} value={money(format, f.variance)}>
          {f.variance < 0 ? t("varianceOver") : t("varianceUnder")} ({percent(format, -f.variance / f.budget, true)})
        </Kpi>
        <Kpi label={t("budget")} value={money(format, f.budget)} />
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border px-4 py-3 sm:grid-cols-3">
        {secondary.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="text-base font-medium tabular-nums">{s.value}</dd>
            <dd className="text-xs text-muted-foreground">{s.hint}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
