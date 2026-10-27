import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ApprovalState } from "@/components/approvals/approval-state";
import { DecisionButtons } from "@/components/dashboard/decision-buttons";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { getApprovalQueue } from "@/lib/approval-queries";
import { getCurrentUser } from "@/lib/dal";
import { money } from "@/lib/format";

const VIEWS = ["mine", "pending", "closed"] as const;
type View = (typeof VIEWS)[number];

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const user = await getCurrentUser();
  const requested = (await searchParams).view;
  const view: View = VIEWS.find((v) => v === requested) ?? "mine";

  const [queue, [config], t, tTeams, format] = await Promise.all([
    getApprovalQueue(user.id, user.teamId), // champions/delegates: own team only
    db.select().from(settings),
    getTranslations("approvals"),
    getTranslations("teams"),
    getFormatter(),
  ]);
  const rows = queue[view];
  const num = "text-right tabular-nums";

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle", { threshold: money(format, config.financeThresholdCents) })}</p>
      </header>

      <nav aria-label={t("tabs.label")} className="flex w-fit gap-1 rounded-lg bg-muted p-1">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={v === "mine" ? "/approvals" : `/approvals?view=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${v === view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t(`tabs.${v}`)} <span className="tabular-nums text-muted-foreground">({queue[v].length})</span>
          </Link>
        ))}
      </nav>

      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t(`empty.${view}`)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("col.request")}</TableHead>
                  <TableHead>{t("col.team")}</TableHead>
                  <TableHead>{t("col.requester")}</TableHead>
                  <TableHead className="text-right">{t("col.amount")}</TableHead>
                  <TableHead>{t("col.submitted")}</TableHead>
                  <TableHead>{t("col.state")}</TableHead>
                  {view === "mine" && <TableHead className="sr-only">{t("detail.yourDecision")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <Link href={`/approvals/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                        {r.expense.description}
                      </Link>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{r.reason}</p>
                    </TableCell>
                    <TableCell>{tTeams(r.teamKey as keyof Messages["teams"])}</TableCell>
                    <TableCell>{r.requesterName}</TableCell>
                    <TableCell className={num}>
                      {money(format, r.expense.amountUsdCents)}
                      {r.expense.currency === "MXN" && (
                        <span className="block text-xs text-muted-foreground">{money(format, r.expense.amountOrigCents, "MXN")}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{format.dateTime(r.createdAt, { dateStyle: "medium" })}</TableCell>
                    <TableCell><ApprovalState row={r} /></TableCell>
                    {view === "mine" && (
                      <TableCell>
                        <DecisionButtons requestId={r.id} label={r.expense.description} amountUsdCents={r.expense.amountUsdCents} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
