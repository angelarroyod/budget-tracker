"use client";

import { InfoIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { saveExpense, type SaveExpenseState } from "@/app/(app)/expenses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ExpenseStatus } from "@/db/schema";
import { type FieldErrors, parseAmountToCents } from "@/lib/expense-form";
import { CURRENT_MONTH, fiscalMonthDate } from "@/lib/forecast";
import { money } from "@/lib/format";
import { type Currency, toUsdCents } from "@/lib/fx";

export type SheetLineItem = { id: number; label: string; annualPlanCents: number; annualBookedCents: number };
export type EditableExpense = {
  id: number;
  description: string;
  vendor: string;
  lineItemId: number | null;
  fiscalMonth: number;
  status: ExpenseStatus;
  currency: Currency;
  amountOrigCents: number;
  fxRate: string;
  nextFy: boolean;
  approval: "none" | "pending" | "approved" | "rejected";
};

export function ExpenseSheet({
  expense,
  lineItems,
  fxRates,
  closeHref,
}: {
  expense: EditableExpense | null; // null = new
  lineItems: SheetLineItem[];
  fxRates: number[];
  closeHref: string;
}) {
  const t = useTranslations("expenses");
  const tStatus = useTranslations("expenseStatus");
  const format = useFormatter();
  const router = useRouter();
  const id = useId();
  const [state, formAction, pending] = useActionState<SaveExpenseState, FormData>(saveExpense, null);

  // All fields controlled: React 19 resets uncontrolled inputs after a form action, which would wipe input on a validation error.
  const [description, setDescription] = useState(expense?.description ?? "");
  const [vendor, setVendor] = useState(expense?.vendor ?? "");
  const [status, setStatus] = useState<ExpenseStatus>(expense?.status ?? "committed");
  const [reason, setReason] = useState("");
  const [lineItem, setLineItem] = useState(expense ? String(expense.lineItemId ?? "unbudgeted") : "");
  const [month, setMonth] = useState(expense?.fiscalMonth ?? CURRENT_MONTH);
  const [currency, setCurrency] = useState<Currency>(expense?.currency ?? "USD");
  const [amount, setAmount] = useState(expense ? (expense.amountOrigCents / 100).toFixed(2) : "");
  const [nextFy, setNextFy] = useState(expense?.nextFy ?? false);

  const locked = expense !== null && expense.approval !== "none"; // only status may change
  const rejected = expense?.approval === "rejected";
  const close = () => router.replace(closeHref, { scroll: false });

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.approvalRequested ? t("toast.savedApproval") : t("toast.saved"));
      close();
    } else if (state.formError) {
      toast.error(t(`toast.${state.formError}`));
    }
    // close/t are stable enough; react only to a new server response
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Live preview: same rate rule as the server (locked rate on edit unless currency changes).
  const cents = parseAmountToCents(amount);
  const rate = expense && currency === expense.currency ? Number(expense.fxRate) : currency === "USD" ? 1 : fxRates[month - 1];
  let usdCents: number | null = null;
  try {
    usdCents = cents === null ? null : toUsdCents(cents, currency, rate).amountUsdCents;
  } catch {
    usdCents = null;
  }

  // Client-side hint only; the server makes the real decision (SPEC §2.7).
  const item = lineItems.find((i) => String(i.id) === lineItem);
  const remaining = item ? item.annualPlanCents - item.annualBookedCents : null;
  const why =
    locked || lineItem === "" ? null
    : lineItem === "unbudgeted" ? t("form.whyUnbudgeted")
    : !nextFy && usdCents !== null && remaining !== null && usdCents > remaining ? t("form.whyOver")
    : null;

  const errors: FieldErrors = state && !state.ok ? state.errors : {};
  const fieldError = (field: keyof FieldErrors) =>
    errors[field] ? (
      <p id={`${id}-${field}-err`} className="text-xs text-destructive">{t(`errors.${errors[field]}`)}</p>
    ) : null;
  const a11y = (field: keyof FieldErrors) =>
    errors[field] ? { "aria-invalid": true, "aria-describedby": `${id}-${field}-err` } : {};

  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{expense ? t("editTitle") : t("newTitle")}</SheetTitle>
          {locked && (
            <SheetDescription className="flex items-center gap-1.5">
              <LockIcon className="size-3.5" aria-hidden />
              {rejected ? t("form.lockedRejected") : t("form.locked")}
            </SheetDescription>
          )}
        </SheetHeader>

        <form action={formAction} className="flex min-h-0 flex-1 flex-col" noValidate>
          {expense && <input type="hidden" name="id" value={expense.id} />}
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-description`}>{t("form.description")}</Label>
              <Input id={`${id}-description`} name="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} required disabled={locked} {...a11y("description")} />
              {fieldError("description")}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-vendor`}>{t("form.vendor")}</Label>
              <Input id={`${id}-vendor`} name="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} maxLength={120} required disabled={locked} {...a11y("vendor")} />
              {fieldError("vendor")}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-lineItem`}>{t("form.lineItem")}</Label>
              <NativeSelect id={`${id}-lineItem`} name="lineItemId" value={lineItem} onChange={(e) => setLineItem(e.target.value)} className="w-full" required disabled={locked} {...a11y("lineItemId")}>
                <NativeSelectOption value="" disabled>{t("form.chooseLineItem")}</NativeSelectOption>
                {lineItems.map((i) => (
                  <NativeSelectOption key={i.id} value={String(i.id)}>{i.label}</NativeSelectOption>
                ))}
                <NativeSelectOption value="unbudgeted">{t("form.unbudgetedOption")}</NativeSelectOption>
              </NativeSelect>
              {remaining !== null && !locked && (
                <p className="text-xs text-muted-foreground tabular-nums">{t("form.remaining", { amount: money(format, Math.max(0, remaining)) })}</p>
              )}
              {fieldError("lineItemId")}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-month`}>{t("form.month")}</Label>
                <NativeSelect id={`${id}-month`} name="fiscalMonth" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full" disabled={locked} {...a11y("fiscalMonth")}>
                  {months.map((m) => (
                    <NativeSelectOption key={m} value={m}>{format.dateTime(fiscalMonthDate(m), { month: "long" })}</NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldError("fiscalMonth")}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-status`}>{t("form.status")}</Label>
                <NativeSelect id={`${id}-status`} name="status" value={status} onChange={(e) => setStatus(e.target.value as ExpenseStatus)} className="w-full" disabled={rejected} {...a11y("status")}>
                  {(["committed", "accrued", "actual"] as const).map((s) => (
                    <NativeSelectOption key={s} value={s}>{tStatus(s)}</NativeSelectOption>
                  ))}
                </NativeSelect>
                {fieldError("status")}
              </div>
            </div>

            <div className="grid grid-cols-[7rem_1fr] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-currency`}>{t("form.currency")}</Label>
                <NativeSelect id={`${id}-currency`} name="currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className="w-full" disabled={locked} {...a11y("currency")}>
                  <NativeSelectOption value="USD">USD</NativeSelectOption>
                  <NativeSelectOption value="MXN">MXN</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-amount`}>{t("form.amount")}</Label>
                <Input
                  id={`${id}-amount`}
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="text-right tabular-nums"
                  disabled={locked}
                  aria-describedby={`${id}-amount-hint`}
                  {...a11y("amountOrigCents")}
                />
              </div>
            </div>
            <div id={`${id}-amount-hint`} className="-mt-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {currency === "MXN" && usdCents !== null ? (
                <>
                  <p className="font-medium text-foreground">{t("form.converted", { usd: money(format, usdCents), rate: rate.toFixed(4) })}</p>
                  {expense && currency === expense.currency && <p>{t("form.rateLocked")}</p>}
                </>
              ) : (
                <p>{t("form.amountHint")}</p>
              )}
            </div>
            {fieldError("amountOrigCents")}

            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                {/* Base UI's switch is a span with its own id, so name it with aria-labelledby, not htmlFor */}
                <Label id={`${id}-nextFy-label`}>{t("form.nextFy")}</Label>
                <p id={`${id}-nextFy-hint`} className="text-xs text-muted-foreground">{t("form.nextFyHint")}</p>
              </div>
              <Switch
                aria-labelledby={`${id}-nextFy-label`}
                aria-describedby={`${id}-nextFy-hint`}
                checked={nextFy}
                onCheckedChange={setNextFy}
                disabled={locked}
              />
              {nextFy && <input type="hidden" name="nextFy" value="on" />}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${id}-invoice`}>{t("form.invoice")}</Label>
              <Input id={`${id}-invoice`} type="file" disabled aria-describedby={`${id}-invoice-hint`} />
              <p id={`${id}-invoice-hint`} className="flex items-center gap-1 text-xs text-muted-foreground">
                <InfoIcon className="size-3.5" aria-hidden />
                {t("form.invoiceDisabled")}
              </p>
            </div>

            {(why || errors.reason) && (
              <div className="flex flex-col gap-2 rounded-lg border border-[color-mix(in_oklab,var(--status-warning)_50%,transparent)] bg-[color-mix(in_oklab,var(--status-warning)_10%,transparent)] p-3">
                {why && (
                  <p className="flex gap-1.5 text-sm">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-warning)" }} aria-hidden />
                    {t("form.willNeedApproval", { why })}
                  </p>
                )}
                <Label htmlFor={`${id}-reason`}>{t("form.reason")}</Label>
                <Textarea id={`${id}-reason`} name="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} placeholder={t("form.reasonHint")} {...a11y("reason")} />
                {fieldError("reason")}
              </div>
            )}
          </div>

          <SheetFooter className="flex-row justify-end border-t">
            <Button type="button" variant="outline" onClick={close}>{t("form.cancel")}</Button>
            {!rejected && (
              <Button type="submit" disabled={pending}>{pending ? t("form.saving") : t("form.save")}</Button>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
