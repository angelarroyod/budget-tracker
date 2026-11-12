import { describe, expect, it } from "vitest";
import { closeBlocker, lockedByClose, type MonthFacts, monthState, parseResolution } from "./month-close";

const facts = (month: number, f: Partial<MonthFacts> = {}): MonthFacts => ({ month, closed: false, hasLedger: true, unresolved: 0, ...f });

describe("monthState", () => {
  it("is open until the ledger is reconciled", () => {
    expect(monthState({ closed: false, hasLedger: false, unresolved: 0 })).toBe("open");
  });
  it("stays open while any exception is unexplained", () => {
    expect(monthState({ closed: false, hasLedger: true, unresolved: 1 })).toBe("open");
  });
  it("is reconciled once every exception is explained", () => {
    expect(monthState({ closed: false, hasLedger: true, unresolved: 0 })).toBe("reconciled");
  });
  it("is closed once finance closes it, even if a later file brings a new exception", () => {
    expect(monthState({ closed: true, hasLedger: true, unresolved: 2 })).toBe("closed");
  });
});

describe("closeBlocker", () => {
  const year = [...Array.from({ length: 8 }, (_, i) => facts(i + 1, { closed: true })), facts(9), facts(10, { hasLedger: false })];

  it("allows closing the next month in order once it's reconciled", () => {
    expect(closeBlocker(year, 9, 10)).toBeNull();
  });
  it("never closes the current or a future month", () => {
    expect(closeBlocker(year, 10, 10)).toBe("current");
    expect(closeBlocker(year, 11, 10)).toBe("current");
  });
  it("refuses a month that is already closed", () => {
    expect(closeBlocker(year, 8, 10)).toBe("closed");
  });
  it("refuses a month with unexplained exceptions", () => {
    expect(closeBlocker([...year.slice(0, 8), facts(9, { unresolved: 3 })], 9, 10)).toBe("unresolved");
  });
  it("refuses a month the ledger hasn't reached", () => {
    expect(closeBlocker([...year.slice(0, 8), facts(9, { hasLedger: false })], 9, 10)).toBe("noLedger");
    expect(closeBlocker([], 3, 10)).toBe("noLedger");
  });
  it("closes months in order: not September while August is open", () => {
    const augustOpen = year.map((f) => (f.month === 8 ? { ...f, closed: false } : f));
    expect(closeBlocker(augustOpen, 9, 10)).toBe("previousOpen");
  });
  it("January has no previous month to wait for", () => {
    expect(closeBlocker([facts(1)], 1, 10)).toBeNull();
  });
});

describe("lockedByClose", () => {
  const closed = new Set([1, 2, 3]);
  it("locks a new expense in a closed month", () => {
    expect(lockedByClose(closed, 2)).toBe(true);
  });
  it("locks moving an expense out of a closed month", () => {
    expect(lockedByClose(closed, 9, 3)).toBe(true);
  });
  it("leaves open months alone", () => {
    expect(lockedByClose(closed, 9)).toBe(false);
    expect(lockedByClose(closed, 10, 9)).toBe(false);
  });
});

describe("parseResolution", () => {
  it("trims and collapses whitespace", () => {
    expect(parseResolution("  Timing   difference;\n posted in October. ")).toBe("Timing difference; posted in October.");
  });
  it("rejects empty, too short and too long text", () => {
    expect(parseResolution(null)).toBeNull();
    expect(parseResolution("   ")).toBeNull();
    expect(parseResolution("ok")).toBeNull();
    expect(parseResolution("x".repeat(501))).toBeNull();
  });
});
