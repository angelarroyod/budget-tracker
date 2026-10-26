import { PiggyBankIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { money } from "@/lib/format";
import type { LineItemSnapshot } from "@/lib/queries";
import { lineItemName } from "./line-items-table";

/** SPEC §2.6: net unspent plan in closed months, per line item. Renders nothing when there are no savings. */
export async function SavingsCallout({ items }: { items: LineItemSnapshot[] }) {
  const top = items.filter((i) => i.savings > 0).toSorted((a, b) => b.savings - a.savings);
  if (top.length === 0) return null;

  const [t, locale, format] = await Promise.all([getTranslations("team.savings"), getLocale(), getFormatter()]);
  const total = top.reduce((sum, i) => sum + i.savings, 0);

  return (
    <aside className="flex gap-3 rounded-xl border bg-muted/40 p-4" aria-label={t("title")}>
      <PiggyBankIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="text-sm">
        <p className="font-medium">{t("headline", { amount: money(format, total) })}</p>
        <p className="text-muted-foreground">{t("explain")}</p>
        <ul className="mt-2 space-y-0.5">
          {top.slice(0, 3).map((i) => (
            <li key={i.id} className="flex justify-between gap-4 tabular-nums">
              <span>{lineItemName(i, locale)}</span>
              <span>{money(format, i.savings)}</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
