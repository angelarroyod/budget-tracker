"use client";

import { InfoIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { MonthForecast } from "@/lib/forecast";
import { compact, money, moneyShort } from "@/lib/format";
import { MonthlyChart, type MonthPoint } from "./monthly-chart";
import { SectionHeading } from "./panel";

const W = 1000; // SVG user units; the SVG stretches to its box (preserveAspectRatio="none", non-scaling strokes)
const H = 250;
const STROKE = { vectorEffect: "non-scaling-stroke", fill: "none" } as const;

/** Four even steps with headroom above the larger of budget and projection, rounded to a "nice" step (8M, not 7.7M). */
function niceMax(v: number) {
  const raw = (v * 1.25) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(raw / mag) * mag * 4;
}

/**
 * Burn-up: cumulative booked spend through the current month, then the forecast to year end. The forecast leaves
 * from what's booked today, adds what the current month still projects plus each later month's projection, so it
 * lands exactly on the projected total. The part above budget is filled amber.
 */
function geometry(months: MonthForecast[], budget: number, currentMonth: number) {
  const cumPlan = [0];
  for (const m of months) cumPlan.push(cumPlan.at(-1)! + m.plan);
  const cumBooked = [0];
  for (const m of months.slice(0, currentMonth)) cumBooked.push(cumBooked.at(-1)! + m.booked);
  const now = cumBooked.at(-1)!;
  const fc: [number, number][] = [[currentMonth, now]];
  for (const m of months.slice(currentMonth)) {
    const carry = m.month === currentMonth + 1 ? months[currentMonth - 1].projected - months[currentMonth - 1].booked : 0;
    fc.push([m.month, fc.at(-1)![1] + carry + m.projected]);
  }
  const end = fc.at(-1)![1];
  const max = niceMax(Math.max(end, budget));
  const X = (month: number) => (month / 12) * W;
  const Y = (v: number) => H - (v / max) * H;
  const path = (pts: [number, number][]) => pts.map(([m, v]) => `${X(m)},${Y(v)}`).join(" L ");
  const booked = cumBooked.map((v, i) => [i, v] as [number, number]);

  // Spend only grows, so once the forecast crosses the budget it stays above it.
  let wedge: string | null = null;
  const i = fc.findIndex(([, v]) => v > budget);
  if (i >= 0) {
    const start: [number, number] = i === 0 ? [fc[0][0], budget] : (() => {
      const [m0, v0] = fc[i - 1];
      const [m1, v1] = fc[i];
      return [m0 + ((budget - v0) / (v1 - v0)) * (m1 - m0), budget];
    })();
    wedge = `M ${path([start, ...fc.slice(i), [fc.at(-1)![0], budget]])} Z`;
  }

  const pct = (v: number) => `${((Y(v) / H) * 100).toFixed(3)}%`;
  return {
    now,
    end,
    nowX: `${((currentMonth / 12) * 100).toFixed(3)}%`,
    rightOfNow: `${(100 - (currentMonth / 12) * 100).toFixed(3)}%`,
    ticks: [0, 1, 2, 3, 4].map((k) => ({ v: (max / 4) * k, top: pct((max / 4) * k) })),
    budgetTop: pct(budget),
    nowTop: pct(now),
    endTop: pct(end),
    d: {
      plan: `M ${path(cumPlan.map((v, m) => [m, v]))}`,
      budget: `M 0,${Y(budget)} L ${W},${Y(budget)}`,
      bookedLine: `M ${path(booked)}`,
      bookedArea: `M ${path(booked)} L ${X(currentMonth)},${H} L 0,${H} Z`,
      fcLine: `M ${path(fc)}`,
      fcArea: `M ${path(fc)} L ${W},${H} L ${X(currentMonth)},${H} Z`,
      wedge,
    },
  };
}

/** Draw the booked line, then the forecast, then the year-end call-out. Skipped when the user prefers reduced motion. */
function useIntro(root: React.RefObject<HTMLDivElement | null>, currentMonth: number) {
  useEffect(() => {
    const el = root.current;
    if (!el || !el.animate || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cut = `${(100 - (currentMonth / 12) * 100).toFixed(3)}%`;
    const left = `${((currentMonth / 12) * 100).toFixed(3)}%`;
    const out = "cubic-bezier(.22,1,.36,1)";
    const run = (k: string, frames: Keyframe[], delay: number, duration: number, easing = out) =>
      el.querySelectorAll(`[data-anim="${k}"]`).forEach((n) => n.animate(frames, { delay, duration, easing, fill: "backwards" }));
    run("booked", [{ clipPath: "inset(-12px 100% -12px 0)" }, { clipPath: `inset(-12px ${cut} -12px 0)` }], 80, 720);
    run("bookedMark", [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], 700, 240);
    run("bookedLabel", [{ opacity: 0 }, { opacity: 1 }], 760, 260);
    run("proj", [{ clipPath: `inset(-12px ${cut} -12px ${left})` }, { clipPath: `inset(-12px 0 -12px ${left})` }], 780, 420, "cubic-bezier(.4,0,.2,1)");
    run("wedge", [{ opacity: 0 }, { opacity: 1 }], 1080, 320);
    run("endMark", [{ opacity: 0, transform: "scale(.4)" }, { opacity: 1, transform: "scale(1)" }], 1120, 280, "cubic-bezier(.34,1.56,.64,1)");
    run("endTip", [{ opacity: 0, transform: "translateY(-100%) translateY(6px)" }, { opacity: 1, transform: "translateY(-100%)" }], 1200, 320);
  }, [root, currentMonth]);
}

function Layer({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <svg data-anim={name} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
      {children}
    </svg>
  );
}

export function ForecastChart({
  months,
  budget,
  currentMonth,
  monthly,
  scope,
}: {
  months: MonthForecast[];
  budget: number;
  currentMonth: number;
  monthly: MonthPoint[];
  /** Whose total the chart shows; picks the subtitle. */
  scope: "site" | "team";
}) {
  const t = useTranslations("dashboard.forecast");
  const tMonthly = useTranslations("dashboard.monthly");
  const format = useFormatter();
  const [view, setView] = useState<"cumulative" | "monthly">("cumulative");
  const root = useRef<HTMLDivElement>(null);
  const g = geometry(months, budget, currentMonth);
  const over = g.end > budget;
  useIntro(root, currentMonth);

  return (
    <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 px-6 pt-[22px] pb-[18px]">
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-2.5">
        <SectionHeading title={t("title")} description={view === "monthly" ? tMonthly("subtitle", { scope, currency: "USD" }) : t("subtitle", { scope, currency: "USD" })} />
        <div role="group" aria-label={t("view")} className="flex rounded-lg bg-muted p-0.5">
          {(["cumulative", "monthly"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className="h-[26px] rounded-md px-2.5 text-xs font-medium text-foreground/70 aria-pressed:bg-card aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-xs"
            >
              {t(v)}
            </button>
          ))}
        </div>
      </div>

      {view === "monthly" ? (
        <MonthlyChart data={monthly} />
      ) : (
        <>
          <div
            ref={root}
            role="img"
            aria-label={t("summary", {
              booked: money(format, g.now),
              month: monthly[currentMonth - 1]?.label ?? "",
              projected: money(format, g.end),
              budget: money(format, budget),
            })}
            className="flex gap-2.5"
          >
            <div className="relative h-[250px] w-[34px] shrink-0 text-xs text-muted-foreground tabular-nums" aria-hidden>
              {g.ticks.map((k) => (
                <span key={k.v} className="absolute right-0 -translate-y-1/2" style={{ top: k.top }}>
                  {k.v ? compact(format, k.v) : "0"}
                </span>
              ))}
            </div>
            <div className="min-w-0 flex-1" aria-hidden>
              <div className="relative h-[250px] text-xs whitespace-nowrap">
                {g.ticks.map((k) => (
                  <span key={k.v} className="absolute inset-x-0 h-px bg-muted" style={{ top: k.top }} />
                ))}
                <span className="absolute inset-y-0 w-px bg-border" style={{ left: g.nowX }} />
                <span className="absolute bottom-1.5 -translate-x-full pr-2 font-medium text-muted-foreground" style={{ left: g.nowX }}>{t("booked")}</span>
                <span className="absolute bottom-1.5 pl-2 font-medium text-muted-foreground" style={{ left: g.nowX }}>{t("forecast")}</span>

                <Layer name="base">
                  <path d={g.d.plan} stroke="var(--muted-foreground)" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="4 4" {...STROKE} />
                  <path d={g.d.budget} stroke="var(--foreground)" strokeWidth={1.5} {...STROKE} />
                </Layer>
                {g.d.wedge && (
                  <Layer name="wedge">
                    <path d={g.d.wedge} fill="var(--status-warning)" />
                  </Layer>
                )}
                <Layer name="booked">
                  <defs>
                    <linearGradient id="booked-fill" x1={0} y1={0} x2={0} y2={1}>
                      <stop offset="0%" stopColor="var(--series-actual)" stopOpacity={0.16} />
                      <stop offset="100%" stopColor="var(--series-actual)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <path d={g.d.bookedArea} fill="url(#booked-fill)" />
                  <path d={g.d.bookedLine} stroke="var(--series-actual)" strokeWidth={2.5} strokeLinejoin="round" {...STROKE} />
                </Layer>
                <Layer name="proj">
                  <path d={g.d.fcArea} fill="var(--series-actual)" fillOpacity={0.05} />
                  <path d={g.d.fcLine} stroke="var(--series-actual)" strokeWidth={2.5} strokeDasharray="6 5" {...STROKE} />
                </Layer>

                <span className="absolute left-2 -translate-y-full pb-1 font-medium text-foreground" style={{ top: g.budgetTop }}>
                  {t("budgetLabel", { amount: moneyShort(format, budget) })}
                </span>
                <span
                  data-anim="bookedMark"
                  className="absolute -mt-[5px] -ml-[5px] size-2.5 rounded-full bg-card shadow-[inset_0_0_0_2.5px_var(--series-actual)]"
                  style={{ left: g.nowX, top: g.nowTop }}
                />
                <span
                  data-anim="bookedLabel"
                  className="absolute -mt-2 -translate-y-full text-foreground/70 tabular-nums"
                  style={{ right: `calc(${g.rightOfNow} + 10px)`, top: g.nowTop }}
                >
                  {t("bookedLabel", { amount: moneyShort(format, g.now, 2) })}
                </span>
                <span
                  data-anim="endMark"
                  className="absolute left-full -mt-1.5 -ml-1.5 size-3 rounded-full ring-3 ring-card"
                  style={{ top: g.endTop, background: over ? "var(--status-warning)" : "var(--series-actual)" }}
                />
                <div
                  data-anim="endTip"
                  className="absolute right-3.5 -mt-3.5 flex -translate-y-full flex-col items-end gap-px rounded-lg bg-foreground px-2.5 py-[7px] text-background tabular-nums"
                  style={{ top: g.endTop }}
                >
                  <span className="text-[13px] font-semibold">{t("projectedLabel", { amount: moneyShort(format, g.end, 2) })}</span>
                  <span className="text-amber-300 dark:text-amber-700">
                    {t("endDelta", { direction: over ? "over" : "under", amount: money(format, Math.abs(g.end - budget)) })}
                  </span>
                </div>
              </div>
              <div className="flex h-6 items-end text-xs text-muted-foreground tabular-nums">
                {monthly.map((m) => (
                  <span key={m.label} className="flex-1 text-center">{m.label}</span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border-t pt-3">
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground/70">
              <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-[2.5px] w-4 rounded-sm bg-(--series-actual)" aria-hidden />{t("booked")}</li>
              <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="w-4 border-t-[2.5px] border-dashed border-(--series-actual)" aria-hidden />{t("forecast")}</li>
              <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="w-4 border-t-2 border-dashed border-muted-foreground/60" aria-hidden />{t("plan")}</li>
              <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-[1.5px] w-4 bg-foreground" aria-hidden />{t("budget")}</li>
            </ul>
            <p className="flex items-center gap-1.5 text-xs leading-[17px] text-muted-foreground">
              <InfoIcon className="size-[13px] shrink-0" aria-hidden />
              <span>
                {t.rich("rule", {
                  code: (chunks) => <code className="rounded bg-muted px-1.5 py-px font-mono text-xs whitespace-nowrap text-foreground">{chunks}</code>,
                })}
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
