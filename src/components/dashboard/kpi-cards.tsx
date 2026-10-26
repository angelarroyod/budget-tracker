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
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {children && <div className="mt-1 text-xs text-muted-foreground">{children}</div>}
      </CardContent>
    </Card>
  );
}

export async function KpiCards({ f }: { f: Forecast }) {
  const [t, format] = await Promise.all([getTranslations("dashboard.kpi"), getFormatter()]);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Kpi label={t("budget")} value={money(format, f.budget)} />
      <Kpi label={t("actual")} value={money(format, f.actual)}>
        {t("actualHint", { pct: percent(format, f.actual / f.budget) })}
      </Kpi>
      <Kpi label={t("committed")} value={money(format, f.committed)}>{t("committedHint")}</Kpi>
      <Kpi label={t("projected")} value={money(format, f.projected)}>
        <StatusBadge status={f.status} />
      </Kpi>
      <Kpi label={t("variance")} value={money(format, f.variance)}>
        {f.variance < 0 ? t("varianceOver") : t("varianceUnder")} ({percent(format, -f.variance / f.budget, true)})
      </Kpi>
      <Kpi label={t("nextFy")} value={money(format, f.nextFy)}>{t("nextFyHint")}</Kpi>
    </div>
  );
}
