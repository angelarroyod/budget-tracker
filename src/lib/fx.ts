export type Currency = "USD" | "MXN";

/**
 * Converts an original amount to USD cents and returns the rate to store with it.
 * The rate is rounded to the 6 decimals the DB keeps (numeric(12,6)) *before* converting,
 * so recomputing from the stored rate always reproduces the stored USD amount.
 */
export function toUsdCents(amountOrigCents: number, currency: Currency, usdMxn: number | string) {
  if (!Number.isInteger(amountOrigCents) || amountOrigCents <= 0) {
    throw new RangeError("Amount must be a positive whole number of cents");
  }
  if (currency === "USD") return { amountUsdCents: amountOrigCents, fxRate: "1.000000" };

  const rate = Number(Number(usdMxn).toFixed(6));
  if (!(rate > 0)) throw new RangeError("Exchange rate must be positive");

  const amountUsdCents = Math.round(amountOrigCents / rate);
  if (amountUsdCents < 1) throw new RangeError("Amount is below 1 USD cent after conversion");
  return { amountUsdCents, fxRate: rate.toFixed(6) };
}
