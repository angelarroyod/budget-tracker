import { expect, test } from "@playwright/test";
import { dollars, loginAs, resetData, startDecision } from "./helpers";

// The README's "Try it" scripts, one per role, against the deterministic seed.
test.beforeEach(async ({ request }) => resetData(request));

test("executive: approving from the dashboard moves the projection by exactly the amount", async ({ page }) => {
  await loginAs(page, "Executive");
  await expect(page).toHaveURL("/");

  // Pending money isn't in the forecast; approving a $12,500 request must add exactly $12,500.
  const projected = page.locator("p", { hasText: /^Projected year-end$/ }).locator("xpath=following-sibling::p[1]");
  const before = dollars(await projected.textContent());
  expect(before).toBeGreaterThan(0);

  const decide = page.getByRole("region", { name: "Needs your decision" });
  await expect(decide).toContainText("Overtime cleaning crew for customer audit");
  const confirm = await startDecision(page, "Approve", "Overtime cleaning crew for customer audit");
  await expect(page.getByText("Approve USD 12,500?")).toBeVisible(); // the confirm names the amount
  await confirm.click();

  await expect(page.getByText("Approved: Overtime cleaning crew for customer audit")).toBeVisible();
  await expect(decide).not.toContainText("Overtime cleaning crew for customer audit");
  await expect.poll(async () => dollars(await projected.textContent())).toBe(before + 12_500);
});

test("champion: an unbudgeted MXN expense converts live and opens an approval request", async ({ page }) => {
  await loginAs(page, "Champion · Facilities");
  await expect(page).toHaveURL(/\/teams\/\d+$/);

  await page.goto("/expenses");
  await page.getByRole("button", { name: "New expense" }).click();
  const form = page.getByRole("dialog", { name: "New expense" });
  await form.getByLabel("Description").fill("Backup sump pump");
  await form.getByLabel("Vendor").fill("Bombas del Norte");
  await form.getByLabel("Line item").selectOption("unbudgeted");
  await form.getByLabel("Currency").selectOption("MXN");
  await form.getByLabel("Amount").fill("94,500");

  // Intl puts a no-break space after the currency code, hence \s.
  await expect(form.getByText(/^≈ USD\s[\d,]+ at \d+\.\d{4} MXN per USD$/)).toBeVisible();
  await expect(form.getByText("This will start an approval request: it has no line item.")).toBeVisible();
  await form.getByLabel("Reason for approval").fill("Storm season; the only pump has no spare.");
  await form.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("Expense saved. Approval request created.")).toBeVisible();

  // The champion raised it, so their step is skipped and it waits on the executive.
  await page.goto("/approvals?view=pending");
  await page.getByRole("link", { name: "Backup sump pump" }).click();
  await expect(page.getByText("Skipped (requester is the champion)")).toBeVisible();
  await expect(page.getByText(/Elena Ruiz · Waiting/)).toBeVisible();
});

test("champion: approving a delegate's request hands it to the executive", async ({ page }) => {
  await loginAs(page, "Champion · Facilities");
  await page.goto("/approvals");
  const confirm = await startDecision(page, "Approve", "Emergency roof leak repair, warehouse B");
  await confirm.click();
  await expect(page.getByText("Approved: Emergency roof leak repair, warehouse B")).toBeVisible();

  await page.goto("/approvals?view=pending");
  await page.getByRole("link", { name: "Emergency roof leak repair, warehouse B" }).click();
  await expect(page.getByText(/Marco Treviño · Approved/)).toBeVisible();
  await expect(page.getByText(/Elena Ruiz · Waiting/)).toBeVisible();
});

test("finance: only requests above the $25,000 threshold ever reach finance", async ({ browser }) => {
  // The executive approves one request on each side of the threshold...
  const exec = await browser.newPage();
  await loginAs(exec, "Executive");
  await exec.goto("/approvals");
  for (const description of ["Temporary chiller rental", "Spill containment kits"]) {
    await (await startDecision(exec, "Approve", description)).click();
    await expect(exec.getByText(`Approved: ${description}`)).toBeVisible();
  }
  await exec.close();

  // ...and finance's queue gets the $42,000 one, never the $8,500 one, which closed as approved.
  const page = await browser.newPage();
  await loginAs(page, "Finance");
  await page.goto("/approvals");
  const rows = page.getByRole("row").filter({ has: page.getByRole("link") });
  await expect(rows.filter({ hasText: "Temporary chiller rental" })).toHaveCount(1);
  await expect(rows.filter({ hasText: "Spill containment kits" })).toHaveCount(0);
  // Amount column: "USD 42,000", plus the MXN original underneath for peso expenses.
  const amounts = await rows.locator("td:nth-child(4)").allInnerTexts();
  expect(amounts.length).toBeGreaterThan(0);
  for (const a of amounts) expect(dollars(a.match(/USD\s*[\d,]+/)?.[0] ?? null)).toBeGreaterThan(25_000);

  await page.goto("/approvals?view=closed");
  await expect(page.getByRole("row").filter({ hasText: "Spill containment kits" })).toContainText("Approved");
  await page.close();
});
