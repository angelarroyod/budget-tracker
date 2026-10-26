import { describe, expect, it } from "vitest";
import { parseAmountToCents, parseExpenseForm } from "./expense-form";

describe("parseAmountToCents", () => {
  it.each([
    ["12345.67", 1_234_567],
    ["12,345.67", 1_234_567],
    ["0.29", 29], // the classic float trap: parseFloat("0.29") * 100 = 28.999…
    ["1.5", 150],
    ["  250 ", 25_000],
    ["999999999.99", 99_999_999_999],
  ])("%j → %i cents", (raw, cents) => {
    expect(parseAmountToCents(raw)).toBe(cents);
  });

  it.each(["", "0", "0.00", "-5", "1.234", "1e5", "abc", "12.3.4", "1,000,000,000.00"])("rejects %j", (raw) => {
    expect(parseAmountToCents(raw)).toBeNull();
  });
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const valid = {
  description: "HVAC filter replacement",
  vendor: "TecnoFrío Industrial",
  lineItemId: "3",
  fiscalMonth: "10",
  status: "committed",
  currency: "MXN",
  amount: "18,900.00",
};

describe("parseExpenseForm", () => {
  it("parses a valid form", () => {
    expect(parseExpenseForm(form({ ...valid, nextFy: "on", reason: " urgent " }))).toEqual({
      ok: true,
      data: {
        description: "HVAC filter replacement",
        vendor: "TecnoFrío Industrial",
        lineItemId: 3,
        fiscalMonth: 10,
        status: "committed",
        currency: "MXN",
        amountOrigCents: 1_890_000,
        nextFy: true,
        reason: "urgent",
      },
    });
  });

  it("maps the unbudgeted option to a null line item", () => {
    const r = parseExpenseForm(form({ ...valid, lineItemId: "unbudgeted" }));
    expect(r.ok && r.data.lineItemId).toBeNull();
  });

  it("treats a missing switch as false", () => {
    const r = parseExpenseForm(form(valid));
    expect(r.ok && r.data.nextFy).toBe(false);
  });

  it("reports every bad field at once", () => {
    const r = parseExpenseForm(
      form({ description: " ", vendor: "x".repeat(121), lineItemId: "abc", fiscalMonth: "13", status: "planned", currency: "EUR", amount: "-1" }),
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        description: "required",
        vendor: "tooLong",
        lineItemId: "invalid",
        fiscalMonth: "invalid",
        status: "invalid",
        currency: "invalid",
        amountOrigCents: "amount",
      },
    });
  });

  it("requires a line item choice", () => {
    const r = parseExpenseForm(form({ ...valid, lineItemId: "" }));
    expect(!r.ok && r.errors.lineItemId).toBe("required");
  });
});
