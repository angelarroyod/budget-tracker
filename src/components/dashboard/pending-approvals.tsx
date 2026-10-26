import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { canDecide } from "@/lib/approvals";
import type { CurrentUser } from "@/lib/dal";
import { money } from "@/lib/format";
import type { PendingRequest } from "@/lib/queries";
import { DecisionButtons } from "./decision-buttons";

export async function PendingApprovals({ requests, exposure, user }: { requests: PendingRequest[]; exposure: number; user: CurrentUser }) {
  const [t, tTeams, tRoles, format] = await Promise.all([
    getTranslations("dashboard.approvals"),
    getTranslations("teams"),
    getTranslations("roles"),
    getFormatter(),
  ]);

  return (
    <div>
      <p className="text-sm font-medium">{t("count", { count: requests.length })}</p>
      {exposure > 0 && <p className="text-xs text-muted-foreground tabular-nums">{t("exposure", { amount: money(format, exposure) })}</p>}

      {requests.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="mt-3 divide-y">
          {requests.map((r) => {
            const mine = canDecide(r.steps, user.id, r.requesterId);
            return (
              <li key={r.id} className="py-3 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/approvals/${r.id}`} className="text-sm font-medium underline-offset-4 hover:underline">{r.description}</Link>
                    <p className="text-xs text-muted-foreground">
                      {t("by", { name: r.requesterName, team: tTeams(r.teamKey as keyof Messages["teams"]) })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums">{money(format, r.amountUsdCents)}</p>
                    {r.currency === "MXN" && (
                      <p className="text-xs text-muted-foreground tabular-nums">{money(format, r.amountOrigCents, "MXN")}</p>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {mine ? (
                    <Badge>{t("yourTurn")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("waitingOn", { role: tRoles(r.current.role) })}</Badge>
                  )}
                  {mine && <DecisionButtons requestId={r.id} label={r.description} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
