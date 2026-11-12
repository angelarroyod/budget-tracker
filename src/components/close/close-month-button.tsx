"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { closeMonth } from "@/app/(app)/close/actions";
import { Button } from "@/components/ui/button";

/** Two steps, like approvals: the first click says what closing does, the second closes. */
export function CloseMonthButton({ month, monthLabel, headingId }: { month: number; monthLabel: string; headingId: string }) {
  const t = useTranslations("close");
  const id = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  if (!confirming) {
    return (
      <Button ref={startRef} onClick={() => setConfirming(true)}>
        <LockIcon aria-hidden />
        {t("closeAction", { month: monthLabel })}
      </Button>
    );
  }

  const confirm = () =>
    startTransition(async () => {
      const result = await closeMonth(month);
      if (result.ok) {
        toast.success(t("toast.closed", { month: monthLabel }));
        document.getElementById(headingId)?.focus(); // this button is gone once the month re-renders as closed
      } else {
        toast.error(t(`blocker.${result.blocker}`, { month: monthLabel }));
        setConfirming(false);
      }
    });

  return (
    <div role="group" aria-labelledby={`${id}-confirm`} className="flex flex-wrap items-center gap-2">
      <p id={`${id}-confirm`} className="text-sm">{t("confirm", { month: monthLabel })}</p>
      <Button ref={confirmRef} onClick={confirm} disabled={pending}>{t("confirmButton")}</Button>
      <Button
        variant="outline"
        onClick={() => {
          setConfirming(false);
          requestAnimationFrame(() => startRef.current?.focus());
        }}
        disabled={pending}
      >
        {t("cancel")}
      </Button>
    </div>
  );
}
