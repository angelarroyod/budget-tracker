import { CheckIcon, ClockIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ApprovalRow } from "@/lib/approval-queries";

/** Neutral badge + icon: red is reserved for "over budget", so a rejection is never shown in red. */
export function ApprovalState({ row }: { row: Pick<ApprovalRow, "status" | "current"> }) {
  const t = useTranslations("approvals.state");
  const tRoles = useTranslations("roles");
  if (row.status === "approved") return <Badge variant="outline"><CheckIcon aria-hidden />{t("approved")}</Badge>;
  if (row.status === "rejected") return <Badge variant="outline"><XIcon aria-hidden />{t("rejected")}</Badge>;
  return (
    <Badge variant="secondary">
      <ClockIcon aria-hidden />
      {t("waitingOn", { role: row.current ? tRoles(row.current.role) : "" })}
    </Badge>
  );
}
