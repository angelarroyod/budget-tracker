"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { decideRequest } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/format";

type Decision = "approved" | "rejected";

/**
 * After a decision the row re-renders without these buttons. Wait for that commit, then move focus to the next
 * request's Approve button (same index, since ours is gone) or back to <main>, so keyboard users aren't dropped on <body>.
 */
function refocusAfterRefresh(own: HTMLElement, index: number) {
  let frames = 0;
  const tick = () => {
    if (own.isConnected && frames++ < 60) return requestAnimationFrame(tick);
    const next = document.querySelectorAll<HTMLElement>("[data-decide=approve]")[index];
    (next ?? document.getElementById("main"))?.focus();
  };
  requestAnimationFrame(tick);
}

/** Two-step decision: the first click names the amount, the second records it. Shared by the queues and the detail page. */
export function DecisionButtons({
  requestId,
  label,
  amountUsdCents,
  comment,
  size = "sm",
}: {
  requestId: number;
  label: string;
  amountUsdCents: number;
  comment?: string;
  size?: "sm" | "default";
}) {
  const t = useTranslations("dashboard.approvals");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(-1);
  const approveRef = useRef<HTMLButtonElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const amount = money(format, amountUsdCents);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const ask = (decision: Decision) => {
    // Remember our place among the Approve buttons now, while ours is still rendered.
    indexRef.current = approveRef.current ? [...document.querySelectorAll("[data-decide=approve]")].indexOf(approveRef.current) : -1;
    setConfirming(decision);
  };

  const cancel = () => {
    const back = confirming === "rejected" ? rejectRef : approveRef;
    setConfirming(null);
    requestAnimationFrame(() => back.current?.focus());
  };

  const commit = (decision: Decision) =>
    startTransition(async () => {
      const res = await decideRequest(requestId, decision, comment);
      if (res.ok) {
        toast.success(`${t(decision)}: ${label}`);
        if (rootRef.current) refocusAfterRefresh(rootRef.current, indexRef.current);
      } else {
        toast.error(t("failed"));
        setConfirming(null);
      }
    });

  return (
    <div ref={rootRef}>
      {confirming ? (
        <div
          role="group"
          aria-label={`${t(confirming === "approved" ? "approve" : "reject")}: ${label}`}
          className="flex flex-wrap items-center gap-2"
          onKeyDown={(e) => e.key === "Escape" && cancel()}
        >
          <span className="text-sm font-medium tabular-nums">
            {t(confirming === "approved" ? "confirmApprove" : "confirmReject", { amount })}
          </span>
          <Button
            ref={confirmRef}
            size={size}
            // Not "destructive": red is reserved for "already over budget".
            variant={confirming === "approved" ? "default" : "outline"}
            disabled={pending}
            onClick={() => commit(confirming)}
          >
            {t("confirm")}
          </Button>
          <Button size={size} variant="ghost" disabled={pending} onClick={cancel}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button ref={approveRef} data-decide="approve" size={size} onClick={() => ask("approved")} aria-label={`${t("approve")}: ${label}`}>
            <CheckIcon aria-hidden />
            {t("approve")}
          </Button>
          <Button ref={rejectRef} size={size} variant="outline" onClick={() => ask("rejected")} aria-label={`${t("reject")}: ${label}`}>
            <XIcon aria-hidden />
            {t("reject")}
          </Button>
        </div>
      )}
    </div>
  );
}
