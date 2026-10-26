"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { decideRequest } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function DecisionButtons({ requestId, label }: { requestId: number; label: string }) {
  const t = useTranslations("dashboard.approvals");
  const [pending, startTransition] = useTransition();

  const act = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const res = await decideRequest(requestId, decision);
      if (res.ok) toast.success(`${t(decision)}: ${label}`);
      else toast.error(t("failed"));
    });

  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => act("approved")} aria-label={`${t("approve")}: ${label}`}>
        <CheckIcon aria-hidden />
        {t("approve")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => act("rejected")} aria-label={`${t("reject")}: ${label}`}>
        <XIcon aria-hidden />
        {t("reject")}
      </Button>
    </div>
  );
}
