import type { ExpenseStatus } from "../db/schema";
import type { Currency } from "./fx";

/** Parsed, validated expense form. Server action and client preview share this. */
export type ExpenseInput = {
  description: string;
  vendor: string;
  lineItemId: number | null; // null = unbudgeted
  fiscalMonth: number;
  status: ExpenseStatus;
  currency: Currency;
  amountOrigCents: number;
  nextFy: boolean;
  reason: string;
};

/** Error codes, translated in the UI (expenses.errors.<code>). */
export type FieldError = "required" | "tooLong" | "invalid" | "amount";
export type FieldErrors = Partial<Record<keyof ExpenseInput, FieldError>>;

const STATUSES: readonly ExpenseStatus[] = ["committed", "accrued", "actual"];
const MAX_CENTS = 99_999_999_999; // under 1 billion per expense: generous, and far below Number.MAX_SAFE_INTEGER

/**
 * "12,345.67" → 1234567. String arithmetic, never floats: parseFloat("0.29") * 100 is 28.999….
 * Accepts thousands separators (commas) and up to 2 decimals. Returns null for anything else.
 */
export function parseAmountToCents(raw: string): number | null {
  const s = raw.trim().replaceAll(",", "");
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.trim() : "");

export function parseStatus(v: FormDataEntryValue | null): ExpenseStatus | null {
  return STATUSES.includes(v as ExpenseStatus) ? (v as ExpenseStatus) : null;
}

export function parseExpenseForm(fd: FormData): { ok: true; data: ExpenseInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const description = text(fd.get("description"));
  if (!description) errors.description = "required";
  else if (description.length > 200) errors.description = "tooLong";

  const vendor = text(fd.get("vendor"));
  if (!vendor) errors.vendor = "required";
  else if (vendor.length > 120) errors.vendor = "tooLong";

  const rawItem = text(fd.get("lineItemId"));
  const lineItemId = rawItem === "unbudgeted" ? null : Number(rawItem);
  if (rawItem === "") errors.lineItemId = "required";
  else if (lineItemId !== null && !(Number.isInteger(lineItemId) && lineItemId > 0)) errors.lineItemId = "invalid";

  const fiscalMonth = Number(text(fd.get("fiscalMonth")));
  if (!(Number.isInteger(fiscalMonth) && fiscalMonth >= 1 && fiscalMonth <= 12)) errors.fiscalMonth = "invalid";

  const status = parseStatus(fd.get("status"));
  if (!status) errors.status = "invalid";

  const currency = text(fd.get("currency"));
  if (currency !== "USD" && currency !== "MXN") errors.currency = "invalid";

  const amountOrigCents = parseAmountToCents(text(fd.get("amount")));
  if (amountOrigCents === null) errors.amountOrigCents = "amount";

  const reason = text(fd.get("reason"));
  if (reason.length > 500) errors.reason = "tooLong";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      description,
      vendor,
      lineItemId,
      fiscalMonth,
      status: status!,
      currency: currency as Currency,
      amountOrigCents: amountOrigCents!,
      nextFy: fd.get("nextFy") === "on",
      reason,
    },
  };
}
