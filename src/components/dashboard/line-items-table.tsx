import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/status-badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Forecast } from "@/lib/forecast";
import { money } from "@/lib/format";
import type { LineItemSnapshot } from "@/lib/queries";

export const lineItemName = (item: Pick<LineItemSnapshot, "nameEn" | "nameEs">, locale: string) =>
  locale.startsWith("es") ? item.nameEs : item.nameEn;

export async function LineItemsTable({ items, total }: { items: LineItemSnapshot[]; total: Forecast }) {
  const [t, locale, format] = await Promise.all([getTranslations("team.items"), getLocale(), getFormatter()]);
  const num = "text-right tabular-nums";

  const cells = (f: Forecast) => (
    <>
      <TableCell className={num}>{money(format, f.budget)}</TableCell>
      <TableCell className={num}>{money(format, f.committed)}</TableCell>
      <TableCell className={num}>{money(format, f.actual)}</TableCell>
      <TableCell className={num}>{money(format, f.projected)}</TableCell>
      <TableCell className={num}>{money(format, f.variance)}</TableCell>
      <TableCell><StatusBadge status={f.status} /></TableCell>
    </>
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("item")}</TableHead>
          <TableHead className="text-right">{t("planned")}</TableHead>
          <TableHead className="text-right">{t("committed")}</TableHead>
          <TableHead className="text-right">{t("actual")}</TableHead>
          <TableHead className="text-right">{t("projected")}</TableHead>
          <TableHead className="text-right">{t("variance")}</TableHead>
          <TableHead>{t("status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              <span className="font-medium">{lineItemName(item, locale)}</span>
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">{item.accountCode}</span>
            </TableCell>
            {cells(item.forecast)}
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        {/* Team total includes unbudgeted (approved) expenses, so it can exceed the sum of the rows above */}
        <TableRow>
          <TableCell className="font-medium">{t("total")}</TableCell>
          {cells(total)}
        </TableRow>
      </TableFooter>
    </Table>
  );
}
