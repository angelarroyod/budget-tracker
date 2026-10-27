import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ClockIcon, SendIcon, SkipForwardIcon, XIcon } from "lucide-react";
import type { Messages } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApprovalState } from "@/components/approvals/approval-state";
import { DecisionPanel } from "@/components/approvals/decision-panel";
import { Panel } from "@/components/dashboard/panel";
import { StatusBadge } from "@/components/status-badge";
import { getApprovalDetail, type TimelineStep } from "@/lib/approval-queries";
import { canDecide } from "@/lib/approvals";
import { canSeeTeam, getCurrentUser } from "@/lib/dal";
import { fiscalMonthDate } from "@/lib/forecast";
import { money } from "@/lib/format";

const DECISION_ICON = { pending: ClockIcon, approved: CheckIcon, rejected: XIcon, skipped: SkipForwardIcon } as const;

export default async function ApprovalDetailPage({ params }: PageProps<"/approvals/[id]">) {
  const user = await getCurrentUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const r = await getApprovalDetail(id);
  // 404 (not 403) for other teams' requests, same as team pages.
  if (!r || !canSeeTeam(user, r.teamId)) notFound();

  const [t, tExp, tStatus, tTeams, locale, format] = await Promise.all([
    getTranslations("approvals"),
    getTranslations("expenses"),
    getTranslations("expenseStatus"),
    getTranslations("teams"),
    getLocale(),
    getFormatter(),
  ]);
  const e = r.expense;
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const mine = canDecide(r.steps, user.id, r.requesterId);
  const { now, ifApproved } = r.impact;

  const fields: [string, React.ReactNode][] = [
    [t("detail.lineItem"), r.lineItem ? (locale.startsWith("es") ? r.lineItem.nameEs : r.lineItem.nameEn) : <span className="text-muted-foreground">{tExp("unbudgeted")}</span>],
    [t("detail.vendor"), e.vendor],
    [t("detail.month"), format.dateTime(fiscalMonthDate(e.fiscalMonth), { month: "long" })],
    [t("detail.status"), tStatus(e.status)],
    [t("detail.original"), money(format, e.amountOrigCents, e.currency)],
    ...(e.currency === "MXN" ? [[t("detail.rate"), Number(e.fxRate).toFixed(4)] as [string, React.ReactNode]] : []),
    [t("detail.usd"), money(format, e.amountUsdCents)],
    ...(e.nextFy ? [[t("detail.nextFy"), "FY2027"] as [string, React.ReactNode]] : []),
  ];

  const stepRow = (st: TimelineStep) => {
    const Icon = DECISION_ICON[st.decision];
    const isCurrent = r.current?.id === st.id;
    return (
      <li key={st.id} className="relative pb-6 pl-10 last:pb-0">
        <span className={`absolute left-0 flex size-7 items-center justify-center rounded-full border bg-background ${isCurrent ? "ring-2 ring-foreground" : ""}`}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <p className="text-sm font-medium">
          {t(`detail.step.${st.role}`)}
          {isCurrent && <span className="ml-2 text-xs font-normal text-muted-foreground">· {t("detail.current")}</span>}
        </p>
        <p className="text-sm text-muted-foreground">
          {st.approverName} · {t(`detail.decision.${st.decision}`)}
          {st.decidedAt && <> · <time dateTime={st.decidedAt.toISOString()}>{when(st.decidedAt)}</time></>}
        </p>
        {st.comment && <blockquote className="mt-1 border-l-2 pl-3 text-sm italic">{st.comment}</blockquote>}
      </li>
    );
  };

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <header>
        <Link href="/approvals" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("detail.back")}
        </Link>
        <p className="text-sm text-muted-foreground">{t("detail.title")} #{r.id}</p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{e.description}</h1>
          <ApprovalState row={r} />
        </div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/teams/${r.teamId}`} className="underline-offset-4 hover:underline">{tTeams(r.teamKey as keyof Messages["teams"])}</Link>
          {" · "}{t("detail.submitted", { name: r.requesterName })} · {when(r.createdAt)}
          {r.closedAt && <> · {t("detail.closed", { date: when(r.closedAt) })}</>}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel title={t("detail.reason")}>
            <p className="text-sm whitespace-pre-line">{r.reason}</p>
          </Panel>

          <Panel title={t("detail.expense")}>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              {fields.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title={t("detail.timeline")}>
            <ol className="relative before:absolute before:top-3 before:bottom-3 before:left-3.5 before:w-px before:bg-border">
              <li className="relative pb-6 pl-10">
                <span className="absolute left-0 flex size-7 items-center justify-center rounded-full border bg-background">
                  <SendIcon className="size-3.5" aria-hidden />
                </span>
                <p className="text-sm font-medium">{t("detail.submitted", { name: r.requesterName })}</p>
                <p className="text-sm text-muted-foreground"><time dateTime={r.createdAt.toISOString()}>{when(r.createdAt)}</time></p>
              </li>
              {r.steps.map(stepRow)}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          {r.status === "pending" && (
            <Panel title={t("detail.yourDecision")}>
              {mine ? (
                <DecisionPanel requestId={r.id} label={e.description} amountUsdCents={e.amountUsdCents} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("detail.notYours", { name: r.current?.approverName ?? "" })}</p>
              )}
            </Panel>
          )}

          {r.status === "pending" && (
            <Panel title={t("detail.impact.title")} description={t("detail.impact.explain")}>
              <p className="text-xs text-muted-foreground">{t("detail.impact.projected")}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 tabular-nums">
                <div>
                  <p className="text-xs text-muted-foreground">{t("detail.impact.now")}</p>
                  <p className="font-semibold">{money(format, now.projected)}</p>
                  <StatusBadge status={now.status} />
                </div>
                <ArrowRightIcon className="size-4 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-xs text-muted-foreground">{t("detail.impact.after")}</p>
                  <p className="font-semibold">{money(format, ifApproved.projected)}</p>
                  <StatusBadge status={ifApproved.status} />
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground tabular-nums">{t("detail.impact.budget", { amount: money(format, now.budget) })}</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
