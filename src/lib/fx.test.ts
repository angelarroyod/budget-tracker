import { describe, expect, it } from "vitest";
import { toUsdCents } from "./fx";

describe("toUsdCents", () => {
  it("passes USD through at rate 1", () => {
    expect(toUsdCents(1_240_000, "USD", 18.9)).toEqual({ amountUsdCents: 1_240_000, fxRate: "1.000000" });
  });

  it("converts MXN at the given rate, rounding to the nearest cent", () => {
    // MXN 215,000.00 / 18.421 = USD 11,671.48...
    expect(toUsdCents(21_500_000, "MXN", 18.421)).toEqual({ amountUsdCents: 1_167_146, fxRate: "18.421000" });
  });

  it("accepts the rate as the string the DB returns", () => {
    expect(toUsdCents(1_890_000, "MXN", "18.900000").amountUsdCents).toBe(100_000);
  });

  it("locks the rate to 6 decimals so the stored rate reproduces the stored amount", () => {
    const { amountUsdCents, fxRate } = toUsdCents(99_999_999, "MXN", 18.42105263157);
    expect(fxRate).toBe("18.421053");
    expect(toUsdCents(99_999_999, "MXN", fxRate).amountUsdCents).toBe(amountUsdCents);
  });

  it.each([0, -100, 12.5, Number.NaN])("rejects invalid amount %s", (amount) => {
    expect(() => toUsdCents(amount, "USD", 1)).toThrow(RangeError);
  });

  it.each([0, -18, "abc"])("rejects invalid rate %s", (rate) => {
    expect(() => toUsdCents(1000, "MXN", rate)).toThrow(RangeError);
  });

  it("rejects amounts that round to zero USD cents", () => {
    expect(() => toUsdCents(1, "MXN", 18.9)).toThrow(/below 1 USD cent/);
  });
});
