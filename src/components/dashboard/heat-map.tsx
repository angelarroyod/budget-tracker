import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { CURRENT_MONTH, fiscalMonthDate, heatCell, type HeatCell, type MonthForecast } from "@/lib/forecast";
import { percent } from "@/lib/format";

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

export async function HeatMap({ rows, selectedMonth }: { rows: HeatRow[]; selectedMonth?: number }) {
  const [t, format] = await Promise.all([getTranslations("dashboard.heat"), getFormatter()]);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const monthShort = (m: number) => format.dateTime(fiscalMonthDate(m), { month: "short" });
  const monthLong = (m: number) => format.dateTime(fiscalMonthDate(m), { month: "long" });

  const label = (c: HeatCell) =>
    c.kind === "pct" ? percent(format, c.pct) : c.kind === "unplanned" ? t("unplanned") : c.kind === "future" ? t("future") : t("empty");

  return (
    <div>
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[44rem] gap-0.5 text-xs"
          style={{ gridTemplateColumns: "minmax(7.5rem, auto) repeat(12, minmax(2.75rem, 1fr))" }}
          role="table"
        >
          <div role="row" className="contents">
            <span role="columnheader" />
            {months.map((m) => (
              <span
                key={m}
                role="columnheader"
                aria-current={m === selectedMonth ? "true" : undefined}
                className={`pb-1 text-center ${m === selectedMonth ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {monthShort(m)}
              </span>
            ))}
          </div>
          {rows.map((row) => {
            const name = row.label;
            return (
              <div role="row" key={row.id} className="contents">
                <span role="rowheader" className="flex items-center pr-2 font-medium">{name}</span>
                {row.months.map((m) => {
                  const c = heatCell(m.plan, m.booked, m.month, CURRENT_MONTH);
                  const text = c.kind === "future" ? "—" : (c.kind === "unplanned" || (c.kind === "pct" && c.over) ? "▲ " : "") + label(c);
                  const aria = t("cell", { team: name, month: monthLong(m.month), value: label(c) });
                  const cls = "flex h-9 items-center justify-center rounded-md tabular-nums";
                  return c.kind === "future" ? (
                    <span key={m.month} role="cell" aria-label={aria} title={aria} className={cls} style={cellStyle(c)}>{text}</span>
                  ) : (
                    // The cell wraps the link: links can't carry role="cell" themselves.
                    <span key={m.month} role="cell" className="flex">
                    <Link
                      href={row.href(m.month)}
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
              </div>
            );
          })}
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="flex" aria-hidden>
            {[1, 2, 3, 4].map((s) => <span key={s} className="h-2.5 w-4 first:rounded-l-sm last:rounded-r-sm" style={{ background: `var(--heat-${s})` }} />)}
          </span>
          {t("legendScale")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--status-warning)" }} aria-hidden />
          ▲ {t("over")} / {t("unplanned")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--heat-empty)" }} aria-hidden />
          {t("future")} (—)
        </li>
      </ul>
    </div>
  );
}
