"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { DecisionButtons } from "@/components/dashboard/decision-buttons";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Detail-page decision: the same confirm-then-record buttons as the queues, plus a comment for the timeline. */
export function DecisionPanel({ requestId, label, amountUsdCents }: { requestId: number; label: string; amountUsdCents: number }) {
  const t = useTranslations("approvals.detail");
  const id = useId();
  const [comment, setComment] = useState("");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-comment`}>{t("comment")}</Label>
        <Textarea
          id={`${id}-comment`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={500}
          aria-describedby={`${id}-hint`}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">{t("commentHint")}</p>
      </div>
      <DecisionButtons requestId={requestId} label={label} amountUsdCents={amountUsdCents} comment={comment} size="default" />
    </div>
  );
}
