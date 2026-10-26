import type { StepDecision, StepRole } from "../db/schema";

/** SPEC §2.7. Pure routing rules; persistence and auth lookups live in server actions. */

export type Step = {
  seq: number;
  role: StepRole;
  approverId: number;
  decision: StepDecision;
  decidedAt?: Date | null;
  comment?: string | null;
};
export type Outcome = "pending" | "approved" | "rejected";

/**
 * An expense needs approval when it has no line item, or when it pushes the line item's
 * annual booked spend above its annual plan. `annualBookedCents` must exclude this expense
 * (so editing an expense doesn't count it twice). Next-FY expenses don't touch this year's plan.
 */
export function needsApproval(e: {
  lineItemId: number | null;
  amountUsdCents: number;
  nextFy: boolean;
  annualPlanCents: number;
  annualBookedCents: number;
}) {
  if (e.lineItemId === null) return true;
  if (e.nextFy) return false;
  return e.annualBookedCents + e.amountUsdCents > e.annualPlanCents;
}

export function buildSteps(r: {
  requesterId: number;
  requesterRole: "executive" | "champion" | "delegate" | "finance";
  championId: number;
  executiveId: number;
  financeId: number;
  amountUsdCents: number;
  financeThresholdCents: number;
}): Step[] {
  // Expenses belong to a team; only that team's people raise requests. This also guarantees
  // the executive and finance steps are never self-approvals.
  if (r.requesterRole !== "champion" && r.requesterRole !== "delegate") {
    throw new Error("Only champions and delegates can raise approval requests");
  }
  const steps: Step[] = [
    {
      seq: 1,
      role: "champion",
      approverId: r.championId,
      decision: r.requesterId === r.championId ? "skipped" : "pending",
    },
    { seq: 2, role: "executive", approverId: r.executiveId, decision: "pending" },
  ];
  if (r.amountUsdCents >= r.financeThresholdCents) {
    steps.push({ seq: 3, role: "finance", approverId: r.financeId, decision: "pending" });
  }
  return steps;
}

export function outcomeOf(steps: Step[]): Outcome {
  if (steps.some((s) => s.decision === "rejected")) return "rejected";
  if (steps.some((s) => s.decision === "pending")) return "pending";
  return "approved";
}

/** The step waiting for a decision now, or null once the request is closed. */
export function currentStep(steps: Step[]): Step | null {
  if (outcomeOf(steps) !== "pending") return null;
  return steps.toSorted((a, b) => a.seq - b.seq).find((s) => s.decision === "pending") ?? null;
}

/** Only the current step's approver may decide, and never on their own request. */
export function canDecide(steps: Step[], userId: number, requesterId: number) {
  const step = currentStep(steps);
  return step !== null && step.approverId === userId && userId !== requesterId;
}

export function decide(
  steps: Step[],
  d: { userId: number; requesterId: number; decision: "approved" | "rejected"; at: Date; comment?: string },
): { steps: Step[]; outcome: Outcome } {
  if (!canDecide(steps, d.userId, d.requesterId)) throw new Error("Not allowed to decide this step");
  const seq = currentStep(steps)!.seq;
  const next = steps.map((s) =>
    s.seq === seq ? { ...s, decision: d.decision, decidedAt: d.at, comment: d.comment ?? null } : s,
  );
  return { steps: next, outcome: outcomeOf(next) };
}
