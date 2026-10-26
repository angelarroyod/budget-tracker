import { describe, expect, it } from "vitest";
import { type ExpenseRow, fiscalMonthDate, forecast, heatCell, type PlanRow, projectMonth, savings, statusOf } from "./forecast";

const OCT = 10;

/** 12 equal monthly plans for one line item. */
const flatPlan = (lineItemId: number, monthly: number): PlanRow[] =>
  Array.from({ length: 12 }, (_, i) => ({ lineItemId, month: i + 1, amountCents: monthly }));

const exp = (over: Partial<ExpenseRow> & Pick<ExpenseRow, "fiscalMonth" | "amountUsdCents">): ExpenseRow => ({
  lineItemId: 1,
  status: "actual",
  nextFy: false,
  approval: "none",
  ...over,
});

describe("projectMonth", () => {
  it("uses booked spend for past months, even below plan", () => {
    expect(projectMonth(100, 40, 9, OCT)).toBe(40);
  });
  it("assumes plan is spent for current and future months", () => {
    expect(projectMonth(100, 40, OCT, OCT)).toBe(100);
    expect(projectMonth(100, 0, 12, OCT)).toBe(100);
  });
  it("uses booked when it already exceeds plan", () => {
    expect(projectMonth(100, 130, 11, OCT)).toBe(130);
  });
});

describe("statusOf", () => {
  it("is over only when actual spend exceeds budget", () => {
    expect(statusOf(1000, 1001, 1001)).toBe("over");
  });
  it("is at risk when projected exceeds budget but actual does not", () => {
    expect(statusOf(1000, 900, 1001)).toBe("at_risk");
  });
  it("is on track at exactly budget", () => {
    expect(statusOf(1000, 1000, 1000)).toBe("on_track");
  });
});

describe("forecast", () => {
  it("with nothing booked, past months project 0 and open months project plan", () => {
    const f = forecast(flatPlan(1, 100), [], OCT);
    expect(f).toMatchObject({ budget: 1200, actual: 0, committed: 0, projected: 300, variance: 900, status: "on_track" });
    expect(f.months).toHaveLength(12);
  });

  it("counts past underspend as booked and future months at plan", () => {
    // Jan–Sep booked 80 each, Oct+ nothing booked → 9×80 + 3×100
    const expenses = Array.from({ length: 9 }, (_, i) => exp({ fiscalMonth: i + 1, amountUsdCents: 80 }));
    const f = forecast(flatPlan(1, 100), expenses, OCT);
    expect(f.projected).toBe(9 * 80 + 3 * 100);
    expect(f.variance).toBe(180);
  });

  it("splits actual+accrued from committed", () => {
    const f = forecast(flatPlan(1, 100), [
      exp({ fiscalMonth: 1, amountUsdCents: 10, status: "actual" }),
      exp({ fiscalMonth: 2, amountUsdCents: 20, status: "accrued" }),
      exp({ fiscalMonth: 3, amountUsdCents: 40, status: "committed" }),
    ], OCT);
    expect(f.actual).toBe(30);
    expect(f.committed).toBe(40);
  });

  it("projects per line item, so one item's overrun is not hidden by another's unspent plan", () => {
    const plans = [...flatPlan(1, 100), ...flatPlan(2, 100)];
    // November: item 1 committed 150 (over), item 2 nothing yet
    const f = forecast(plans, [exp({ lineItemId: 1, fiscalMonth: 11, amountUsdCents: 150, status: "committed" })], OCT);
    expect(f.months[10]).toEqual({ month: 11, plan: 200, booked: 150, actual: 0, committed: 150, projected: 250 });
  });

  it("adds unbudgeted spend on top of plan", () => {
    const f = forecast(flatPlan(1, 100), [exp({ lineItemId: null, fiscalMonth: 7, amountUsdCents: 500 })], OCT);
    expect(f.months[6].projected).toBe(500); // July: item 1 booked 0 (past), unbudgeted 500
    expect(f.projected).toBe(9 * 0 + 500 + 3 * 100);
  });

  it("excludes next-FY commitments from this year and reports them separately", () => {
    const f = forecast(flatPlan(1, 100), [exp({ fiscalMonth: 12, amountUsdCents: 100_000, status: "committed", nextFy: true })], OCT);
    expect(f.projected).toBe(300); // Oct–Dec at plan; the 100,000 is not in December
    expect(f.committed).toBe(0);
    expect(f.nextFy).toBe(100_000);
  });

  it("excludes pending approvals from the forecast and reports them as exposure", () => {
    const f = forecast(flatPlan(1, 100), [exp({ lineItemId: null, fiscalMonth: OCT, amountUsdCents: 999, status: "committed", approval: "pending" })], OCT);
    expect(f.projected).toBe(300);
    expect(f.pendingExposure).toBe(999);
  });

  it("ignores rejected expenses entirely", () => {
    const f = forecast(flatPlan(1, 100), [exp({ fiscalMonth: 1, amountUsdCents: 999, approval: "rejected", nextFy: true })], OCT);
    expect(f).toMatchObject({ actual: 0, nextFy: 0, pendingExposure: 0 });
  });

  it("counts approved unbudgeted expenses normally", () => {
    const f = forecast(flatPlan(1, 100), [exp({ lineItemId: null, fiscalMonth: 7, amountUsdCents: 2000, approval: "approved" })], OCT);
    expect(f.actual).toBe(2000);
    expect(f.status).toBe("over");
  });

  it("flags at risk when committed future spend pushes projection over budget", () => {
    const expenses = [
      ...Array.from({ length: 9 }, (_, i) => exp({ fiscalMonth: i + 1, amountUsdCents: 100 })),
      exp({ fiscalMonth: 11, amountUsdCents: 400, status: "committed" }),
    ];
    const f = forecast(flatPlan(1, 100), expenses, OCT);
    expect(f.actual).toBe(900);
    expect(f.projected).toBe(900 + 100 + 400 + 100);
    expect(f.status).toBe("at_risk");
  });
});

describe("heatCell", () => {
  it("shows future months as neutral", () => {
    expect(heatCell(100, 0, 11, OCT)).toEqual({ kind: "future" });
  });
  it("shows empty when there is no plan and nothing booked", () => {
    expect(heatCell(0, 0, 3, OCT)).toEqual({ kind: "empty" });
  });
  it("flags unplanned spend instead of dividing by zero", () => {
    expect(heatCell(0, 50, 3, OCT)).toEqual({ kind: "unplanned" });
  });
  it("is not over at exactly 100%", () => {
    expect(heatCell(100, 100, 3, OCT)).toEqual({ kind: "pct", pct: 1, over: false });
  });
  it("is over above 100%", () => {
    expect(heatCell(100, 101, OCT, OCT)).toMatchObject({ over: true });
  });
});

describe("savings", () => {
  it("is unspent plan in past months", () => {
    const expenses = Array.from({ length: 9 }, (_, i) => exp({ fiscalMonth: i + 1, amountUsdCents: 70 }));
    expect(savings(forecast(flatPlan(1, 100), expenses, OCT), OCT)).toBe(9 * 30);
  });
  it("ignores the current month, which is still open", () => {
    expect(savings(forecast(flatPlan(1, 100), [], OCT), OCT)).toBe(9 * 100);
    expect(savings(forecast(flatPlan(1, 100), [], 1), 1)).toBe(0);
  });
  it("nets overspend against underspend and never goes negative", () => {
    const expenses = Array.from({ length: 9 }, (_, i) => exp({ fiscalMonth: i + 1, amountUsdCents: 150 }));
    expect(savings(forecast(flatPlan(1, 100), expenses, OCT), OCT)).toBe(0);
  });
});

describe("fiscalMonthDate", () => {
  // Servers run in UTC; viewers and the plant are elsewhere. The label must not slip a month.
  it.each(["UTC", "America/Monterrey", "Pacific/Pago_Pago", "Pacific/Kiritimati"])("labels every month correctly in %s", (timeZone) => {
    const fmt = new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone });
    for (let m = 1; m <= 12; m++) expect(fmt.format(fiscalMonthDate(m))).toBe(String(m));
  });
});
