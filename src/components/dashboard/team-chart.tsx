"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatusBadge } from "@/components/status-badge";
import type { Status } from "@/lib/forecast";
import { compact, money } from "@/lib/format";

export type TeamBar = { name: string; budget: number; projected: number; status: Status };

const STATUS_FILL: Record<Status, string> = {
  on_track: "var(--status-good)",
  at_risk: "var(--status-warning)",
  over: "var(--status-critical)",
};

/** Budget (neutral) beside projected (filled by status). Status is also named in the tooltip and the team table. */
export function TeamChart({ data }: { data: TeamBar[] }) {
  const t = useTranslations("dashboard.byTeam");
  const format = useFormatter();

  return (
    <div>
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: "var(--series-budget)" }} aria-hidden />
          {t("budget")}
        </li>
        <li className="flex flex-wrap items-center gap-1.5">
          {t("projected")}:
          <StatusBadge status="on_track" />
          <StatusBadge status="at_risk" />
          <StatusBadge status="over" />
        </li>
      </ul>
      <ResponsiveContainer width="100%" height={data.length * 44 + 30}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            tickFormatter={(v: number) => compact(format, v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={({ active, payload }) => {
              const d = payload?.[0]?.payload as TeamBar | undefined;
              if (!active || !d) return null;
              return (
                <div className="rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-md">
                  <p className="mb-1.5 font-medium">{d.name}</p>
                  <p className="tabular-nums">{t("budget")}: {money(format, d.budget)}</p>
                  <p className="mb-1.5 tabular-nums">{t("projected")}: {money(format, d.projected)}</p>
                  <StatusBadge status={d.status} />
                </div>
              );
            }}
          />
          <Bar dataKey="budget" fill="var(--series-budget)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
          <Bar dataKey="projected" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.name} fill={STATUS_FILL[d.status]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
