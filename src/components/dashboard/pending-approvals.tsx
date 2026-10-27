import { ArrowRightIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { cn } from "cn";
import { canDecide, type Step } from "@/lib/approvals";
import type { CurrentUser } from "@/lib/dal";
import type { Forecast } from "@/lib/forecast";
import { money } from "@/lib/format";
import type { PendingRequest } from "@/lib/queries";
import { DecisionButtons } from "./decision-buttons";
import { SURFACE } from "./panel";

/** Requests the viewer can decide now, with what approving them does to the forecast; then everything waiting on others. */
export async function PendingApprovals({ requests, forecast: f, user }: { requests: PendingRequest[]; forecast: Forecast; user: CurrentUser }) {
  const [t, tTeams, tRoles, format] = await Promise.all([
    getTranslations("dashboard.approvals"),
    getTranslations("teams"),
    getTranslations("roles"),
    getFormatter(),
  ]);
  const team = (key: string) => tTeams(key as keyof Messages["teams"]);
  const mine = requests.filter((r) => canDecide(r.steps, user.id, r.requesterId));
  const others = requests.filter((r) => !mine.includes(r));
  const adds = mine.reduce((sum, r) => sum + r.amountUsdCents, 0);
  const after = f.variance - adds;
  const b = (chunks: React.ReactNode) => <span className="font-medium text-foreground tabular-nums">{chunks}</span>;

  const step = (s: Step, r: PendingRequest) => {
    const role = t(`steps.${s.role}`);
    const current = s.seq === r.current.seq;
    const label =
      current && mine.includes(r) ? t("you")
      : s.decision === "skipped" ? t("skipped", { role })
      : s.decision === "approved" ? t("approvedStep", { role })
      : role;
    return (
      <li
        key={s.seq}
        aria-current={current ? "step" : undefined}
        className={cn(
          "inline-flex h-5 items-center rounded-full px-[7px] whitespace-nowrap",
          current && mine.includes(r) ? "bg-primary font-semibold text-primary-foreground"
          : s.decision === "pending" ? "bg-card ring-1 ring-border ring-inset"
          : "bg-muted",
        )}
      >
        {label}
      </li>
    );
  };

  return (
    <section aria-labelledby="decide-title" className={`min-w-0 flex-[1_1_340px] ${SURFACE}`}>
      <div className="flex flex-col gap-1 px-[22px] pt-5 pb-3.5">
        <div className="flex items-center gap-2">
          <h2 id="decide-title" className="text-[15px] leading-5 font-semibold tracking-tight whitespace-nowrap">{t("title")}</h2>
          {mine.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">{mine.length}</span>
          )}
        </div>
        <p className="text-[13px] leading-[18px] text-pretty text-muted-foreground">
          {mine.length > 0
            ? t.rich("impact", {
                count: mine.length,
                amount: money(format, adds),
                total: money(format, Math.abs(after)),
                direction: after < 0 ? "over" : "under",
                b,
              })
            : t("empty")}
        </p>
      </div>

      {mine.length > 0 && (
        <ul className="border-t">
          {mine.map((r) => (
            <li key={r.id} className="flex flex-col gap-2.5 border-b px-[22px] py-3.5">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/approvals/${r.id}`} className="text-sm leading-[19px] font-medium text-pretty underline-offset-[3px] hover:underline">{r.description}</Link>
                  <p className="mt-0.5 text-xs leading-[17px] text-muted-foreground">
                    {t("meta", { team: team(r.teamKey), name: r.requesterName, date: format.dateTime(r.createdAt, { month: "short", day: "numeric" }) })}
                  </p>
                </div>
                <div className="shrink-0 text-right whitespace-nowrap tabular-nums">
                  <p className="text-sm leading-[19px] font-semibold">{money(format, r.amountUsdCents)}</p>
                  {r.currency === "MXN" && <p className="mt-0.5 text-xs leading-[17px] text-muted-foreground">{money(format, r.amountOrigCents, "MXN")}</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ol className="flex items-center gap-1 text-xs text-muted-foreground">{r.steps.map((s) => step(s, r))}</ol>
                <DecisionButtons requestId={r.id} label={r.description} amountUsdCents={r.amountUsdCents} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 && (
        <>
          <p className="px-[22px] pt-3.5 pb-1.5 text-xs font-medium text-muted-foreground">{t("others", { count: others.length })}</p>
          <ul>
            {others.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-[22px] py-[9px]">
                <div className="min-w-0 flex-1">
                  <Link href={`/approvals/${r.id}`} className="block truncate text-[13px] leading-[18px] font-medium underline-offset-[3px] hover:underline">{r.description}</Link>
                  <p className="text-xs text-muted-foreground">{t("waitingOn", { team: team(r.teamKey), role: tRoles(r.current.role) })}</p>
                </div>
                <span className="text-[13px] font-medium whitespace-nowrap tabular-nums">{money(format, r.amountUsdCents)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-2 flex items-center justify-between gap-3 border-t bg-muted/50 px-[22px] py-3">
        <p className="text-xs text-pretty text-muted-foreground tabular-nums">
          {f.pendingExposure > 0 ? t("exposure", { amount: money(format, f.pendingExposure) }) : ""}
        </p>
        <Link href="/approvals" className="inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap hover:underline underline-offset-[3px]">
          {t("queue")}
          <ArrowRightIcon className="size-3.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
