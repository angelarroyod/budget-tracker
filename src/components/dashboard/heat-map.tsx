import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CURRENT_MONTH, fiscalMonthDate, heatCell, type HeatCell, type MonthForecast } from "@/lib/forecast";
import { percent } from "@/lib/format";
import { HeatGrid } from "./heat-grid";

/**
 * Sequential blue up to 100% of the month's plan; amber + ▲ above it. Not red: one hot month doesn't mean the team
 * is over its annual budget, and red is reserved for that (SPEC §2.4).
 */
const OVER: React.CSSProperties = { background: "var(--status-warning)", color: "#0b0b0b" };

function cellStyle(c: HeatCell): React.CSSProperties {
  if (c.kind === "pct") {
    if (c.over) return OVER;
    // Buckets crowd near 100%: most months land at 80–100% of plan, so that band gets two steps.
    const step = c.pct <= 0.5 ? 1 : c.pct <= 0.8 ? 2 : c.pct <= 0.95 ? 3 : 4;
    return { background: `var(--heat-${step})`, color: `var(--heat-ink-${step})` };
  }
  if (c.kind === "unplanned") return OVER;
  return { background: "var(--heat-empty)", color: "var(--muted-foreground)" };
}

/** One heat-map row: a team (site view) or a line item (team view). `href` makes past/current cells links. */
export type HeatRow = { id: number; label: string; months: MonthForecast[]; href: (month: number) => string };

/** Legend for the panel header: the four blue steps, amber for over plan, and future months. */
export async function HeatLegend() {
  const t = await getTranslations("dashboard.heat");
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-foreground/70">
      <li className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4].map((s) => <span key={s} className="h-2.5 w-3.5 rounded-[3px]" style={{ background: `var(--heat-${s})` }} />)}
        </span>
        {t("legendScale")}
      </li>
      <li className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-2.5 w-3.5 rounded-[3px]" style={{ background: "var(--status-warning)" }} aria-hidden />
        ▲ {t("over")}
      </li>
      <li className="flex items-center gap-1.5 whitespace-nowrap">
        <span className="h-2.5 w-3.5 rounded-[3px] ring-1 ring-border ring-inset" style={{ background: "var(--heat-empty)" }} aria-hidden />
        {t("future")}
      </li>
    </ul>
  );
}

export async function HeatMap({ rows, selectedMonth }: { rows: HeatRow[]; selectedMonth?: number }) {
  const [t, format] = await Promise.all([getTranslations("dashboard.heat"), getFormatter()]);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthShort = (m: number) => format.dateTime(fiscalMonthDate(m), { month: "short" });
  const monthLong = (m: number) => format.dateTime(fiscalMonthDate(m), { month: "long" });

  const label = (c: HeatCell) =>
    c.kind === "pct" ? percent(format, c.pct) : c.kind === "unplanned" ? t("unplanned") : c.kind === "future" ? t("future") : t("empty");

  // One tab stop for the whole grid: the selected month's first link, else the current month's (HeatGrid moves from there).
  const startCol = selectedMonth ?? CURRENT_MONTH;

  return (
    <div>
      <div className="overflow-x-auto">
        <HeatGrid
          className="grid min-w-[940px] gap-[3px] text-xs"
          style={{ gridTemplateColumns: "minmax(110px, auto) repeat(12, minmax(60px, 1fr)) minmax(68px, 1fr)" }}
          role="grid"
          aria-label={t("title")}
          data-rows={rows.length}
        >
          <div role="row" className="contents">
            <span role="columnheader" />
            {months.map((m) => (
              <span
                key={m}
                role="columnheader"
                aria-current={m === selectedMonth ? "true" : undefined}
                className="flex justify-center pb-1.5"
              >
                {/* The current month is the edge between booked and forecast, so it gets the one dark pill. */}
                <span
                  className={`flex h-5 items-center rounded-full px-[7px] tabular-nums ${
                    m === CURRENT_MONTH ? "bg-foreground font-semibold text-background"
                    : m === selectedMonth ? "font-semibold text-foreground underline underline-offset-4"
                    : m > CURRENT_MONTH ? "text-muted-foreground/60"
                    : "text-muted-foreground"
                  }`}
                >
                  {monthShort(m)}
                </span>
              </span>
            ))}
            <span role="columnheader" className="flex items-center justify-center pb-1.5 font-semibold">{t("ytd")}</span>
          </div>
          {rows.map((row, ri) => {
            const name = row.label;
            const closed = row.months.filter((m) => m.month <= CURRENT_MONTH);
            const plan = closed.reduce((sum, m) => sum + m.plan, 0);
            const ytd = heatCell(plan, closed.reduce((sum, m) => sum + m.booked, 0), CURRENT_MONTH, CURRENT_MONTH);
            const ytdOver = ytd.kind === "unplanned" || (ytd.kind === "pct" && ytd.over);
            return (
              <div role="row" key={row.id} className="contents">
                <span role="rowheader" className="flex items-center pr-2.5 text-[13px] font-medium whitespace-nowrap">{name}</span>
                {row.months.map((m) => {
                  const c = heatCell(m.plan, m.booked, m.month, CURRENT_MONTH);
                  const text = c.kind === "future" ? "—" : (c.kind === "unplanned" || (c.kind === "pct" && c.over) ? "▲ " : "") + label(c);
                  const aria = t("cell", { team: name, month: monthLong(m.month), value: c.kind === "pct" && c.over ? `${label(c)}, ${t("over")}` : label(c) });
                  const cls = `flex h-8 items-center justify-center rounded-md whitespace-nowrap tabular-nums ${c.kind === "pct" && c.over ? "font-semibold" : ""}`;
                  return c.kind === "future" ? (
                    <span key={m.month} role="gridcell" aria-label={aria} title={aria} className={cls} style={cellStyle(c)}>{text}</span>
                  ) : (
                    // The cell wraps the link: links can't carry role="gridcell" themselves.
                    <span key={m.month} role="gridcell" className="flex">
                    <Link
                      href={row.href(m.month)}
                      data-r={ri}
                      data-c={m.month}
                      tabIndex={ri === 0 && m.month === startCol ? 0 : -1}
                      aria-label={aria}
                      title={aria}
                      className={`${cls} w-full outline-offset-2 hover:ring-2 hover:ring-foreground/40 focus-visible:outline-2 focus-visible:outline-ring ${m.month === selectedMonth ? "ring-2 ring-foreground" : ""}`}
                      style={cellStyle(c)}
                    >
                      {text}
                    </Link>
                    </span>
                  );
                })}
                <span
                  role="gridcell"
                  aria-label={t("ytdCell", { team: name, value: label(ytd) })}
                  className={`flex h-8 items-center justify-center rounded-md bg-card font-semibold whitespace-nowrap tabular-nums ring-1 ring-inset ${ytdOver ? "ring-(--status-warning)" : "ring-border"}`}
                >
                  {ytdOver ? "▲ " : ""}{label(ytd)}
                </span>
              </div>
            );
          })}
        </HeatGrid>
      </div>
    </div>
  );
}
