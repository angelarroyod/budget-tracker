import type { createFormatter } from "next-intl";

type Formatter = ReturnType<typeof createFormatter>;

/** Whole currency units with the ISO code always shown ("USD 7,200,000"). Dashboard-level precision. */
export const money = (f: Formatter, cents: number, currency: "USD" | "MXN" = "USD") =>
  f.number(cents / 100, { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 0 });

/** Chart axis ticks: "7.2M" (the currency code lives in the chart subtitle). */
export const compact = (f: Formatter, cents: number) =>
  f.number(cents / 100, { notation: "compact", maximumFractionDigits: 1 });

export const percent = (f: Formatter, ratio: number, signed = false) =>
  f.number(ratio, { style: "percent", maximumFractionDigits: 1, signDisplay: signed ? "exceptZero" : "auto" });
