import { getFormatter, getTranslations } from "next-intl/server";
import { CURRENT_MONTH, fiscalMonthDate, type Forecast } from "@/lib/forecast";
import { money, percent } from "@/lib/format";
import { ForecastChart } from "./forecast-chart";
import { SURFACE } from "./panel";

/** Where the year lands: the projected total and what it's made of, beside the burn-up chart that shows how it gets there. */
export async function Projection({ f, scope = "site" }: { f: Forecast; scope?: "site" | "team" }) {
  const [t, format] = await Promise.all([getTranslations("dashboard.projection"), getFormatter()]);
  const share = (cents: number) => `${Math.min(100, (cents / f.budget) * 100).toFixed(2)}%`;
  const parts = [
    { label: t("actual"), hint: t("actualHint"), value: f.actual, swatch: "bg-(--series-actual)" },
    { label: t("committed"), hint: t("committedHint"), value: f.committed, swatch: "bg-(--series-committed)" },
    { label: t("nextFy"), hint: t("nextFyHint"), value: f.nextFy, swatch: "ring-[1.5px] ring-muted-foreground/60 ring-inset", muted: true },
  ];

  return (
    <section className={`flex flex-wrap ${SURFACE}`}>
      <div className="flex max-w-full flex-[1_1_300px] flex-col gap-[18px] border-r px-6 py-[22px]">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t("projected")}</p>
          <p className="text-[34px] leading-[38px] font-semibold tracking-[-0.03em] tabular-nums">{money(format, f.projected)}</p>
        </div>
        <dl className="flex flex-col border-t">
          <div className="flex items-baseline justify-between gap-3 border-b py-2.5">
            <dt className="text-[13px] whitespace-nowrap text-muted-foreground">{t("budget")}</dt>
            <dd className="text-sm font-medium whitespace-nowrap tabular-nums">{money(format, f.budget)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-b py-2.5">
            <dt className="text-[13px] whitespace-nowrap text-muted-foreground">{t("variance")}</dt>
            <dd className="text-sm font-semibold whitespace-nowrap tabular-nums">
              {t("varianceValue", { amount: money(format, Math.abs(f.variance)), direction: f.variance < 0 ? "over" : "under" })}
            </dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px] whitespace-nowrap">
            <p className="font-medium">{t("booked")}</p>
            <p className="text-muted-foreground tabular-nums">{t("bookedPct", { pct: percent(format, (f.actual + f.committed) / f.budget) })}</p>
          </div>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="bg-(--series-actual)" style={{ width: share(f.actual) }} />
            <span className="bg-(--series-committed)" style={{ width: share(f.committed) }} />
          </div>
          <ul className="flex flex-col gap-[7px] text-[13px]">
            {parts.map((p) => (
              <li key={p.label} className="flex items-center gap-2">
                <span className={`size-2 shrink-0 rounded-[2px] ${p.swatch}`} aria-hidden />
                <span className="flex-1 text-foreground/70">
                  {p.label} <span className="text-muted-foreground">· {p.hint}</span>
                </span>
                <span className={`font-medium whitespace-nowrap tabular-nums ${p.muted ? "text-foreground/70" : ""}`}>{money(format, p.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ForecastChart
        months={f.months}
        budget={f.budget}
        currentMonth={CURRENT_MONTH}
        scope={scope}
        monthly={f.months.map((m) => ({
          label: format.dateTime(fiscalMonthDate(m.month), { month: "short" }),
          plan: m.plan,
          actual: m.actual,
          committed: m.committed,
        }))}
      />
    </section>
  );
}
