import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { expenses, plans } from "@/db/schema";
import { getCurrentUser, homePath } from "@/lib/dal";
import { CURRENT_MONTH, fiscalMonthDate, forecast } from "@/lib/forecast";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (user.teamId) redirect(homePath(user)); // champions and delegates have no site-wide view

  const [planRows, expenseRows, t, format] = await Promise.all([
    db.select().from(plans),
    db.select().from(expenses),
    getTranslations("dashboard"),
    getFormatter(),
  ]);
  const site = forecast(planRows, expenseRows, CURRENT_MONTH);
  const over = site.variance < 0;

  // ponytail: headline only for now; KPI cards, charts and tables arrive in Phase 3.
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("asOf", { month: format.dateTime(fiscalMonthDate(CURRENT_MONTH), { month: "long" }) })}
      </p>
      <p className="mt-6 text-lg tabular-nums">
        {t("headline", {
          amount: format.number(Math.abs(site.variance) / 100, { style: "currency", currency: "USD", currencyDisplay: "code" }),
          direction: over ? "over" : "under",
          pct: format.number((site.projected - site.budget) / site.budget, { style: "percent", maximumFractionDigits: 1, signDisplay: "always" }),
        })}
      </p>
    </div>
  );
}
