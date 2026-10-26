"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { approvalRequests, approvalSteps, expenses, users } from "@/db/schema";
import { currentStep, decide, type Outcome } from "@/lib/approvals";
import { getCurrentUser, homePath } from "@/lib/dal";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import { LOCALE_COOKIE, type Locale, locales } from "@/i18n/request";

const DEMO_ACCOUNTS = {
  executive: "elena.ruiz@cobalt.example",
  champion: "facilities.champion@cobalt.example",
  finance: "sofia.garza@cobalt.example",
} as const;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
} as const;

export async function loginAs(formData: FormData) {
  const role = formData.get("role");
  // Only the three demo accounts can be signed into, whatever the form posts.
  if (role !== "executive" && role !== "champion" && role !== "finance") return;
  const [user] = await db.select().from(users).where(eq(users.email, DEMO_ACCOUNTS[role]));
  if (!user) throw new Error(`Demo account for ${role} is missing. Run db:seed.`);
  (await cookies()).set(SESSION_COOKIE, await signSession(user.id), cookieOptions);
  redirect(homePath(user));
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function setLocale(formData: FormData) {
  const locale = formData.get("locale");
  if (!locales.includes(locale as Locale)) return;
  // Setting a cookie in a server action re-renders the current page with the new locale.
  (await cookies()).set(LOCALE_COOKIE, locale as Locale, { ...cookieOptions, httpOnly: false, maxAge: 60 * 60 * 24 * 365 });
}

export type DecideResult = { ok: true; outcome: Outcome } | { ok: false };

/**
 * Records the current user's decision on the step that's waiting for them. The request row is
 * locked so two clicks (or two approvers) can't both act on the same step.
 */
export async function decideRequest(requestId: number, decision: "approved" | "rejected"): Promise<DecideResult> {
  const user = await getCurrentUser();
  if (!Number.isInteger(requestId) || (decision !== "approved" && decision !== "rejected")) return { ok: false };

  try {
    const outcome = await db.transaction(async (tx) => {
      const [req] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).for("update");
      if (!req || req.status !== "pending") throw new Error("Request is not pending");
      const steps = await tx.select().from(approvalSteps).where(eq(approvalSteps.requestId, requestId)).orderBy(asc(approvalSteps.seq));

      // decide() throws unless this user is the current step's approver and not the requester
      const at = new Date();
      const step = currentStep(steps);
      const result = decide(steps, { userId: user.id, requesterId: req.requesterId, decision, at });
      await tx.update(approvalSteps).set({ decision, decidedAt: at }).where(eq(approvalSteps.id, step!.id));

      if (result.outcome !== "pending") {
        await tx.update(approvalRequests).set({ status: result.outcome, closedAt: at }).where(eq(approvalRequests.id, requestId));
        await tx.update(expenses).set({ approval: result.outcome, updatedAt: at }).where(eq(expenses.id, req.expenseId));
      }
      return result.outcome;
    });
    revalidatePath("/", "layout");
    return { ok: true, outcome };
  } catch (err) {
    console.error("decideRequest failed", { requestId, userId: user.id, err });
    return { ok: false };
  }
}
