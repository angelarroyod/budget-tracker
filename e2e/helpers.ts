import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Reloads the deterministic seed through the same endpoint the nightly cron calls. */
export async function resetData(request: APIRequestContext) {
  const res = await request.get("/api/reset", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(res.status(), "reset needs CRON_SECRET to match the server's").toBe(200);
}

/** The three one-click demo roles on the login screen (button names start with the role label). */
export type Role = "Executive" | "Champion · Facilities" | "Finance";

export async function loginAs(page: Page, role: Role) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${role}`) }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}

/** "USD 1,234,567" (any locale) → 1234567. Whole dollars, which is what the dashboard shows. */
export const dollars = (text: string | null) => Number((text ?? "").replace(/[^\d]/g, ""));

/**
 * Clicks Approve or Reject on a request, which reveals the confirm step that names the amount.
 * Returns the Confirm button so callers decide when (or how many times at once) to press it.
 */
export async function startDecision(page: Page, decision: "Approve" | "Reject", description: string) {
  await page.getByRole("button", { name: `${decision}: ${description}` }).click();
  return page.getByRole("group", { name: `${decision}: ${description}` }).getByRole("button", { name: "Confirm" });
}
