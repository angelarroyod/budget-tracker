"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthForecast } from "@/lib/forecast";
import { compact, money } from "@/lib/format";

export type MonthPoint = Pick<MonthForecast, "plan" | "actual" | "committed"> & { label: string };

/** Actual + committed stacked against the plan line. One axis, one unit (USD cents formatted). */
export function MonthlyChart({ data }: { data: MonthPoint[] }) {
  const t = useTranslations("dashboard.monthly");
  const format = useFormatter();
  const fmt = (v: unknown) => money(format, Number(v));

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            width={48}
            tickFormatter={(v: number) => compact(format, v)}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={fmt}
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "var(--popover-foreground)", fontWeight: 500 }}
            itemStyle={{ color: "var(--popover-foreground)" }}
          />
          <Legend
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => <span className="text-muted-foreground">{value}</span>}
          />
          {/* stroke = surface color gives the 2px gap between stacked segments */}
          <Bar dataKey="actual" name={t("actual")} stackId="booked" fill="var(--series-actual)" stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
          <Bar dataKey="committed" name={t("committed")} stackId="booked" fill="var(--series-committed)" stroke="var(--card)" strokeWidth={2} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line dataKey="plan" name={t("plan")} type="monotone" stroke="var(--foreground)" strokeWidth={2} strokeDasharray="4 3" dot={{ r: 4, fill: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">{t("showTable")}</summary>
        <table className="mt-2 w-full text-xs tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              <th className="py-1 text-left font-medium">{t("month")}</th>
              <th className="py-1 text-right font-medium">{t("plan")}</th>
              <th className="py-1 text-right font-medium">{t("actual")}</th>
              <th className="py-1 text-right font-medium">{t("committed")}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-t">
                <td className="py-1">{d.label}</td>
                <td className="py-1 text-right">{fmt(d.plan)}</td>
                <td className="py-1 text-right">{fmt(d.actual)}</td>
                <td className="py-1 text-right">{fmt(d.committed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
