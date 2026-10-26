import { CalendarClockIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type * as s from "@/db/schema";
import { money } from "@/lib/format";
import type { LineItemSnapshot } from "@/lib/queries";
import { lineItemName } from "./line-items-table";

type Expense = typeof s.expenses.$inferSelect;

/** The heat-map drill-down: every expense booked to this team in one fiscal month. */
export async function MonthExpenses({ expenses, items }: { expenses: Expense[]; items: LineItemSnapshot[] }) {
  const [t, tStatus, locale, format] = await Promise.all([
    getTranslations("team.month"),
    getTranslations("expenseStatus"),
    getLocale(),
    getFormatter(),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const num = "text-right tabular-nums";

  if (expenses.length === 0) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("description")}</TableHead>
          <TableHead>{t("lineItem")}</TableHead>
          <TableHead>{t("vendor")}</TableHead>
          <TableHead>{t("status")}</TableHead>
          <TableHead className="text-right">{t("original")}</TableHead>
          <TableHead className="text-right">{t("usd")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {expenses.map((e) => {
          const item = e.lineItemId ? itemById.get(e.lineItemId) : undefined;
          return (
            <TableRow key={e.id}>
              <TableCell className="max-w-72 whitespace-normal">
                <span className="font-medium">{e.description}</span>
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {e.approval !== "none" && <Badge variant="outline">{t(`approval.${e.approval}`)}</Badge>}
                  {e.nextFy && (
                    <Badge variant="outline">
                      <CalendarClockIcon aria-hidden />
                      {t("nextFy")}
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="whitespace-normal">{item ? lineItemName(item, locale) : <span className="text-muted-foreground">{t("unbudgeted")}</span>}</TableCell>
              <TableCell className="whitespace-normal">{e.vendor}</TableCell>
              <TableCell>{tStatus(e.status)}</TableCell>
              <TableCell className={num}>
                {money(format, e.amountOrigCents, e.currency)}
                {e.currency === "MXN" && (
                  <span className="block text-xs text-muted-foreground">@ {Number(e.fxRate).toFixed(4)}</span>
                )}
              </TableCell>
              <TableCell className={num}>{money(format, e.amountUsdCents)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
