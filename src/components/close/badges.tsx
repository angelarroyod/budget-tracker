import { BookOpenIcon, CheckIcon, CircleDashedIcon, LockIcon, ReceiptIcon, ScaleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { reconKindEnum } from "@/db/schema";
import type { MonthState } from "@/lib/month-close";

/** Neutral badges with an icon and a word: red means "over budget" only, and an exception isn't that. */
export function MonthStateBadge({ state }: { state: MonthState }) {
  const t = useTranslations("close.state");
  const Icon = { open: CircleDashedIcon, reconciled: CheckIcon, closed: LockIcon }[state];
  return (
    <Badge variant={state === "open" ? "secondary" : "outline"}>
      <Icon aria-hidden />
      {t(state)}
    </Badge>
  );
}

type ExceptionKind = Exclude<(typeof reconKindEnum.enumValues)[number], "matched">;

export function ExceptionKindBadge({ kind }: { kind: ExceptionKind }) {
  const t = useTranslations("close.kind");
  const Icon = { amount_mismatch: ScaleIcon, ledger_only: BookOpenIcon, tracker_only: ReceiptIcon }[kind];
  return (
    <Badge variant="outline">
      <Icon aria-hidden />
      {t(kind)}
    </Badge>
  );
}
