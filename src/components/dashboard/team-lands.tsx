import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { Forecast } from "@/lib/forecast";
import { money, moneyShort, percent } from "@/lib/format";
import { SectionHeading, SURFACE } from "./panel";

const COLS = "grid grid-cols-[minmax(112px,1fr)_minmax(120px,2fr)_70px_118px_136px] items-center gap-x-3 px-5";

/**
 * One bar per row on a shared % of budget scale with the budget at a fixed mark. Solid = booked, hatched = forecast
 * still to come. Booked spend past the budget is red (already over, SPEC §2.4); forecast past it is amber hatch, or
 * red hatch once the row is already over. A row with no budget (approved unbudgeted spend) is all overrun: red across.
 */
function Bar({ f, scale }: { f: Forecast; scale: number }) {
  if (f.budget === 0) {
    const booked = `${(((f.actual + f.committed) / f.projected) * 100).toFixed(3)}%`;
    return (
      <div className="flex h-3.5 overflow-hidden rounded bg-muted" aria-hidden>
        <span className="bg-(--status-critical)" style={{ width: booked }} />
        <span className="flex-1" style={{ background: "var(--hatch-critical)" }} />
      </div>
    );
  }
  const booked = (f.actual + f.committed) / f.budget;
  const projected = f.projected / f.budget;
  const w = (x: number) => `${((Math.max(0, x) / scale) * 100).toFixed(3)}%`;
  return (
    <div className="relative h-3.5 rounded bg-muted" aria-hidden>
      <div className="absolute inset-0 flex overflow-hidden rounded">
        <span className="bg-(--series-actual)" style={{ width: w(Math.min(booked, 1)) }} />
        <span className="bg-(--status-critical)" style={{ width: w(booked - 1) }} />
        <span style={{ width: w(Math.min(projected, 1) - booked), background: "var(--hatch-forecast)" }} />
        <span style={{ width: w(projected - Math.max(booked, 1)), background: f.status === "over" ? "var(--hatch-critical)" : "var(--hatch-warning)" }} />
      </div>
      <span className="absolute -inset-y-1 -ml-px w-0.5 rounded-[1px] bg-foreground" style={{ left: w(1) }} />
    </div>
  );
}

export type LandsRow = { id: number; label: string; href?: string; forecast: Forecast };

/** Where each row (team or line item) lands against its own budget, biggest overrun first, with a total row. */
export async function TeamLands({
  rows,
  total,
  title,
  subtitle,
  nameHeader,
  totalLabel,
}: {
  rows: LandsRow[];
  total: Forecast;
  title: string;
  subtitle: string;
  nameHeader: string;
  totalLabel: string;
}) {
  const [t, format] = await Promise.all([getTranslations("dashboard.lands"), getFormatter()]);
  const sorted = rows.toSorted((a, b) => a.forecast.variance - b.forecast.variance);
  // 130% leaves room past the budget mark; grows only if a row projects beyond it.
  const scale = Math.max(1.3, ...rows.filter((r) => r.forecast.budget > 0).map((r) => r.forecast.projected / r.forecast.budget));

  const cells = (f: Forecast, strong: boolean) => {
    const weight = strong || f.variance < 0 ? "font-semibold" : "";
    return (
      <>
        <span role="cell"><Bar f={f} scale={scale} /></span>
        <span role="cell" className={`text-right text-sm tabular-nums ${weight}`}>{f.budget ? percent(format, f.projected / f.budget) : "—"}</span>
        <span role="cell" className="text-right">
          <span className={`block text-sm leading-[19px] tabular-nums ${weight}`}>{money(format, Math.abs(f.variance))}</span>
          <span className="block text-xs text-muted-foreground">{f.variance < 0 ? t("over") : t("under")}</span>
        </span>
        <span role="cell" className="justify-self-start"><StatusBadge status={f.status} /></span>
      </>
    );
  };

  return (
    <section aria-labelledby="lands-title" className={`min-w-0 flex-[2_1_600px] ${SURFACE}`}>
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-2.5 px-6 pt-5 pb-3.5">
        <SectionHeading id="lands-title" title={title} description={subtitle} />
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-foreground/70">
          <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-3 rounded-[2px] bg-(--series-actual)" aria-hidden />{t("booked")}</li>
          <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-3 rounded-[2px]" style={{ background: "var(--hatch-forecast)" }} aria-hidden />{t("forecast")}</li>
          <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-3 w-0.5 bg-foreground" aria-hidden />{t("budget")}</li>
        </ul>
      </div>
      <div className="overflow-x-auto">
        <div role="table" aria-labelledby="lands-title" className="min-w-[644px]">
          <div role="row" className={`${COLS} border-y bg-muted/50 py-2 text-xs font-medium text-muted-foreground`}>
            <span role="columnheader">{nameHeader}</span>
            <span role="columnheader">{t("bar")}</span>
            <span role="columnheader" className="text-right whitespace-nowrap">{t("pct")}</span>
            <span role="columnheader" className="text-right">{t("variance")}</span>
            <span role="columnheader">{t("status")}</span>
          </div>
          {sorted.map((row) => (
            // Stretched link: the whole row is clickable, but only the name is the link's accessible name.
            <div role="row" key={row.id} className={`${COLS} relative border-b py-[11px] ${row.href ? "hover:bg-muted/50" : ""}`}>
              <span role="rowheader" className="min-w-0">
                {row.href ? (
                  <Link href={row.href} className="block text-sm leading-[19px] font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset">
                    {row.label}
                  </Link>
                ) : (
                  <span className="block text-sm leading-[19px] font-medium">{row.label}</span>
                )}
                {row.forecast.budget > 0 && (
                  <span className="block text-xs text-muted-foreground tabular-nums">{t("budgetShort", { amount: moneyShort(format, row.forecast.budget) })}</span>
                )}
              </span>
              {cells(row.forecast, false)}
            </div>
          ))}
          <div role="row" className={`${COLS} bg-muted/50 pt-3 pb-3.5`}>
            <span role="rowheader">
              <span className="block text-sm leading-[19px] font-semibold">{totalLabel}</span>
              <span className="block text-xs text-muted-foreground tabular-nums">{t("budgetShort", { amount: moneyShort(format, total.budget) })}</span>
            </span>
            {cells(total, true)}
          </div>
        </div>
      </div>
    </section>
  );
}
