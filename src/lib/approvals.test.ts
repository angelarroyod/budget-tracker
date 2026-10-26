import { describe, expect, it } from "vitest";
import { buildSteps, canDecide, currentStep, decide, needsApproval, outcomeOf, type Step } from "./approvals";

const CHAMPION = 10, DELEGATE = 11, EXEC = 1, FINANCE = 2;
const THRESHOLD = 2_500_000; // $25,000
const at = new Date("2026-10-26T15:00:00Z");

const route = (requesterId: number, amountUsdCents: number, requesterRole: "champion" | "delegate" = requesterId === CHAMPION ? "champion" : "delegate") =>
  buildSteps({ requesterId, requesterRole, championId: CHAMPION, executiveId: EXEC, financeId: FINANCE, amountUsdCents, financeThresholdCents: THRESHOLD });

const decisions = (steps: Step[]) => steps.map((s) => `${s.role}:${s.decision}`);

describe("needsApproval", () => {
  const base = { lineItemId: 5, amountUsdCents: 100, nextFy: false, annualPlanCents: 1000, annualBookedCents: 800 };

  it("always for unbudgeted expenses, even next-FY", () => {
    expect(needsApproval({ ...base, lineItemId: null, nextFy: true })).toBe(true);
  });
  it("not when the expense fits the line item's remaining plan", () => {
    expect(needsApproval({ ...base, amountUsdCents: 200 })).toBe(false); // exactly reaches plan
  });
  it("when the expense pushes the line item over its annual plan", () => {
    expect(needsApproval({ ...base, amountUsdCents: 201 })).toBe(true);
  });
  it("not for next-FY expenses on a line item", () => {
    expect(needsApproval({ ...base, amountUsdCents: 1_000_000, nextFy: true })).toBe(false);
  });
});

describe("buildSteps", () => {
  it("delegate below threshold: champion → executive", () => {
    expect(decisions(route(DELEGATE, 1_000_000))).toEqual(["champion:pending", "executive:pending"]);
  });
  it("champion's own request skips the champion step", () => {
    expect(decisions(route(CHAMPION, 1_000_000))).toEqual(["champion:skipped", "executive:pending"]);
  });
  it("adds finance at exactly the threshold", () => {
    expect(decisions(route(DELEGATE, THRESHOLD))).toEqual(["champion:pending", "executive:pending", "finance:pending"]);
  });
  it("no finance just below the threshold", () => {
    expect(route(DELEGATE, THRESHOLD - 1)).toHaveLength(2);
  });
  it.each(["executive", "finance"] as const)("rejects requests raised by %s", (role) => {
    expect(() =>
      buildSteps({ requesterId: EXEC, requesterRole: role, championId: CHAMPION, executiveId: EXEC, financeId: FINANCE, amountUsdCents: 1, financeThresholdCents: THRESHOLD }),
    ).toThrow();
  });
});

describe("currentStep / outcomeOf", () => {
  it("skips over a skipped champion step", () => {
    expect(currentStep(route(CHAMPION, 100))?.role).toBe("executive");
  });
  it("is null and approved when every step is approved or skipped", () => {
    const steps = route(CHAMPION, 100).map((s) => ({ ...s, decision: s.decision === "pending" ? "approved" as const : s.decision }));
    expect(currentStep(steps)).toBeNull();
    expect(outcomeOf(steps)).toBe("approved");
  });
  it("is null and rejected once any step rejects, even with later steps pending", () => {
    const steps = route(DELEGATE, THRESHOLD).map((s) => (s.seq === 1 ? { ...s, decision: "rejected" as const } : s));
    expect(currentStep(steps)).toBeNull();
    expect(outcomeOf(steps)).toBe("rejected");
  });
  it("respects seq order even if steps arrive unsorted", () => {
    expect(currentStep(route(DELEGATE, THRESHOLD).reverse())?.seq).toBe(1);
  });
});

describe("canDecide", () => {
  it("only the current step's approver can decide", () => {
    const steps = route(DELEGATE, THRESHOLD);
    expect(canDecide(steps, CHAMPION, DELEGATE)).toBe(true);
    expect(canDecide(steps, EXEC, DELEGATE)).toBe(false); // not their turn yet
    expect(canDecide(steps, FINANCE, DELEGATE)).toBe(false);
  });
  it("never lets someone decide their own request", () => {
    // Even if data were inconsistent and the requester sat on the current step
    const steps: Step[] = [{ seq: 1, role: "champion", approverId: DELEGATE, decision: "pending" }];
    expect(canDecide(steps, DELEGATE, DELEGATE)).toBe(false);
  });
  it("nobody can decide a closed request", () => {
    const steps = route(CHAMPION, 100).map((s) => ({ ...s, decision: "rejected" as const }));
    expect(canDecide(steps, EXEC, CHAMPION)).toBe(false);
  });
});

describe("decide", () => {
  it("walks the full chain to approved", () => {
    let steps = route(DELEGATE, THRESHOLD);
    for (const userId of [CHAMPION, EXEC]) {
      const r = decide(steps, { userId, requesterId: DELEGATE, decision: "approved", at });
      expect(r.outcome).toBe("pending");
      steps = r.steps;
    }
    const final = decide(steps, { userId: FINANCE, requesterId: DELEGATE, decision: "approved", at });
    expect(final.outcome).toBe("approved");
    expect(final.steps.every((s) => s.decidedAt === at)).toBe(true);
  });

  it("rejection closes the request immediately and keeps the comment", () => {
    const r = decide(route(CHAMPION, THRESHOLD), { userId: EXEC, requesterId: CHAMPION, decision: "rejected", at, comment: "Not this year" });
    expect(r.outcome).toBe("rejected");
    expect(r.steps.find((s) => s.role === "executive")).toMatchObject({ decision: "rejected", comment: "Not this year" });
    expect(r.steps.find((s) => s.role === "finance")?.decision).toBe("pending");
  });

  it("does not mutate the input steps", () => {
    const steps = route(CHAMPION, 100);
    decide(steps, { userId: EXEC, requesterId: CHAMPION, decision: "approved", at });
    expect(steps[1].decision).toBe("pending");
  });

  it("throws when the user is not the current approver", () => {
    expect(() => decide(route(DELEGATE, 100), { userId: EXEC, requesterId: DELEGATE, decision: "approved", at })).toThrow();
  });
});
