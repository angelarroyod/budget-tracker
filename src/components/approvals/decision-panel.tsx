"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { decideRequest } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Detail-page decision: same server action as the quick buttons, plus a comment for the timeline. */
export function DecisionPanel({ requestId, label }: { requestId: number; label: string }) {
  const t = useTranslations("approvals.detail");
  const tDash = useTranslations("dashboard.approvals");
  const id = useId();
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const act = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await decideRequest(requestId, decision, comment);
      if (res.ok) toast.success(`${tDash(decision)}: ${label}`);
      else toast.error(tDash("failed"));
    });

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
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => act("approved")}>
          <CheckIcon aria-hidden />
          {tDash("approve")}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => act("rejected")}>
          <XIcon aria-hidden />
          {tDash("reject")}
        </Button>
      </div>
    </div>
  );
}
