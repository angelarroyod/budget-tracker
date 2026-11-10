import { expect, test, type Page } from "@playwright/test";
import { loginAs, resetData, startDecision } from "./helpers";

// The README's "server is the security boundary" claims, checked over real HTTP.
test.beforeEach(async ({ request }) => resetData(request));

const REQUEST = "Overtime cleaning crew for customer audit"; // single executive step in the seed

/** The sonner toast a decision ends with: "success" or "error". */
const toastType = async (page: Page) => {
  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  return toast.getAttribute("data-type");
};

test("two simultaneous decisions on one step: exactly one is recorded", async ({ browser }) => {
  // Two tabs for the executive. One approves, the other rejects, both confirmed at the same moment.
  // Without the row lock both transactions read "pending" and both succeed, so the last one wins silently.
  const [a, b] = await Promise.all([browser.newPage(), browser.newPage()]);
  for (const page of [a, b]) {
    await loginAs(page, "Executive");
    await page.goto("/approvals?view=pending");
    await page.getByRole("link", { name: REQUEST }).click();
    await expect(page).toHaveURL(/\/approvals\/\d+$/);
  }
  const confirmA = await startDecision(a, "Approve", REQUEST);
  const confirmB = await startDecision(b, "Reject", REQUEST);
  await Promise.all([confirmA.click(), confirmB.click()]);

  const [typeA, typeB] = await Promise.all([toastType(a), toastType(b)]);
  expect([typeA, typeB].sort()).toEqual(["error", "success"]);

  // The timeline agrees with whichever tab won, and records a single executive decision.
  const winner = typeA === "success" ? "Approved" : "Rejected";
  await a.reload();
  await expect(a.getByText(/^Elena Ruiz · (Approved|Rejected)/)).toHaveCount(1);
  await expect(a.getByText(new RegExp(`^Elena Ruiz · ${winner}`))).toBeVisible();
  await Promise.all([a.close(), b.close()]);
});

test("a champion gets a 404, not a 403, for another team's pages", async ({ browser, page }) => {
  // Find another team's approval request as the executive, who can see every team.
  const exec = await browser.newPage();
  await loginAs(exec, "Executive");
  await exec.goto("/approvals?view=closed");
  const otherRequest = await exec.getByRole("link", { name: "Emergency air compressor replacement" }).getAttribute("href");
  await exec.close();
  expect(otherRequest).toMatch(/^\/approvals\/\d+$/);

  await loginAs(page, "Champion · Facilities");
  const ownTeam = Number(new URL(page.url()).pathname.split("/").pop());
  const otherTeam = (ownTeam % 8) + 1;

  expect((await page.goto(`/teams/${ownTeam}`))?.status()).toBe(200);
  expect((await page.goto(`/teams/${otherTeam}`))?.status()).toBe(404);
  expect((await page.goto(otherRequest!))?.status()).toBe(404);
});

test("a tampered session cookie is treated as signed out", async ({ context, page, baseURL }) => {
  // The cookie is "<userId>.<HMAC>"; claiming user 1 with a made-up signature must not work.
  await context.addCookies([{ name: "session", value: "1.bm90LWEtcmVhbC1zaWduYXR1cmU", url: baseURL! }]);
  await page.goto("/");
  await expect(page).toHaveURL("/login");
});

test("the demo reset refuses callers without the cron secret", async ({ request }) => {
  expect((await request.get("/api/reset")).status()).toBe(401);
  expect((await request.get("/api/reset", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});
