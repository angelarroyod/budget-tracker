"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { resolveException, type ResolveState } from "@/app/(app)/close/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RESOLUTION_MAX } from "@/lib/month-close";

/**
 * After a resolution the page re-renders this exception with its explanation instead of the form. Wait for that,
 * then move focus to the explanation, so keyboard and screen-reader users land on what they just did.
 */
function focusWhenGone(form: HTMLFormElement, targetId: string) {
  let frames = 0;
  const tick = () => {
    if (form.isConnected && frames++ < 60) return requestAnimationFrame(tick);
    (document.getElementById(targetId) ?? document.getElementById("main"))?.focus();
  };
  requestAnimationFrame(tick);
}

export function ResolveForm({ itemId, label, resolvedId }: { itemId: number; label: string; resolvedId: string }) {
  const t = useTranslations("close");
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState(""); // controlled: React resets uncontrolled fields after an action
  // The toast fires from the action itself: on success this component unmounts before an effect could run.
  const [state, action, pending] = useActionState<ResolveState, FormData>(async (prev, fd) => {
    const result = await resolveException(prev, fd);
    if (result?.ok) {
      toast.success(t("toast.resolved"));
      if (formRef.current) focusWhenGone(formRef.current, resolvedId);
    } else if (result) toast.error(t(`toast.${result.error}`));
    return result;
  }, null);
  const invalid = state?.ok === false && state.error === "invalid";

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-1.5" noValidate>
      <input type="hidden" name="itemId" value={itemId} />
      <Label htmlFor={`${id}-resolution`}>
        {t("resolution")}
        <span className="sr-only">: {label}</span>
      </Label>
      <Textarea
        id={`${id}-resolution`}
        name="resolution"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={RESOLUTION_MAX}
        aria-describedby={`${id}-hint`}
        aria-invalid={invalid || undefined}
      />
      <p id={`${id}-hint`} className={`text-xs ${invalid ? "text-foreground" : "text-muted-foreground"}`}>
        {invalid && <span className="font-medium">{t("errors.invalid")} </span>}
        {t("resolutionHint")}
      </p>
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {pending ? t("resolving") : t("resolve")}
        <span className="sr-only">: {label}</span>
      </Button>
    </form>
  );
}
