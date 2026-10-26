import { CalendarClockIcon, PencilIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fiscalMonthDate } from "@/lib/forecast";
import { money } from "@/lib/format";
import type { getExpenseList } from "@/lib/queries";

type Row = Awaited<ReturnType<typeof getExpenseList>>["rows"][number];

export async function ExpenseTable({
  rows,
  showTeam,
  editHref,
}: {
  rows: Row[];
  showTeam: boolean;
  editHref: ((id: number) => string) | null; // null = read-only viewer
}) {
  const [t, tStatus, tTeams, locale, format] = await Promise.all([
    getTranslations("expenses"),
    getTranslations("expenseStatus"),
    getTranslations("teams"),
    getLocale(),
    getFormatter(),
  ]);
  const num = "text-right tabular-nums";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("col.description")}</TableHead>
          {showTeam && <TableHead>{t("col.team")}</TableHead>}
          <TableHead>{t("col.lineItem")}</TableHead>
          <TableHead>{t("col.vendor")}</TableHead>
          <TableHead>{t("col.month")}</TableHead>
          <TableHead>{t("col.status")}</TableHead>
          <TableHead className="text-right">{t("col.original")}</TableHead>
          <TableHead className="text-right">{t("col.usd")}</TableHead>
          {editHref && <TableHead className="sr-only">{t("col.actions")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ expense: e, teamKey, lineItemEn, lineItemEs }) => (
          <TableRow key={e.id}>
            <TableCell className="max-w-72 whitespace-normal">
              <span className="font-medium">{e.description}</span>
              <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                {e.approval !== "none" && <Badge variant={e.approval === "pending" ? "secondary" : "outline"}>{t(`approval.${e.approval}`)}</Badge>}
                {e.nextFy && (
                  <Badge variant="outline">
                    <CalendarClockIcon aria-hidden />
                    {t("nextFy")}
                  </Badge>
                )}
              </span>
            </TableCell>
            {showTeam && <TableCell>{tTeams(teamKey as keyof Messages["teams"])}</TableCell>}
            <TableCell className="whitespace-normal">
              {lineItemEn ? (locale.startsWith("es") ? lineItemEs : lineItemEn) : <span className="text-muted-foreground">{t("unbudgeted")}</span>}
            </TableCell>
            <TableCell className="whitespace-normal">{e.vendor}</TableCell>
            <TableCell>{format.dateTime(fiscalMonthDate(e.fiscalMonth), { month: "short" })}</TableCell>
            <TableCell>{tStatus(e.status)}</TableCell>
            <TableCell className={num}>
              {money(format, e.amountOrigCents, e.currency)}
              {e.currency === "MXN" && <span className="block text-xs text-muted-foreground">@ {Number(e.fxRate).toFixed(4)}</span>}
            </TableCell>
            <TableCell className={num}>{money(format, e.amountUsdCents)}</TableCell>
            {editHref && (
              <TableCell className="text-right">
                {e.approval !== "rejected" && (
                  <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={editHref(e.id)} scroll={false} />} aria-label={`${t("edit")}: ${e.description}`}>
                    <PencilIcon />
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
