import { expect, test } from "@playwright/test";
import { loginAs, resetData } from "./helpers";

// Month close against the fictional ledger: September has four exceptions; January–August are closed.
test.beforeEach(async ({ request }) => resetData(request));

const SEPTEMBER_EXCEPTIONS = [
  "HVAC maintenance contract", // amount mismatch
  "Expedited freight on spare parts", // ledger only
  "Waste disposal – part 2", // tracker only, because its peso row was rejected for a wrong rate
  "Packaging materials – part 1", // tracker only, never posted
];

test("finance: explains every September exception, then closes the month", async ({ page }) => {
  await loginAs(page, "Finance");
  await page.getByRole("link", { name: "Month close" }).click();

  await expect(page.getByRole("heading", { name: "September 2026" })).toBeVisible();
  // The four exceptions account for the whole difference between ledger and tracker.
  await expect(page.getByRole("row").filter({ hasText: /^September/ })).toContainText(/-USD\s45,234\.44/);
  await expect(page.getByText("4 exceptions still need an explanation before September can close.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Close September/ })).toHaveCount(0);
  // Rejected rows are listed apart: they're fixed in the ledger, not explained.
  await expect(page.getByRole("row").filter({ hasText: "JE-2026-09-0068" })).toContainText("Unknown account");

  // An explanation has to say something.
  const first = SEPTEMBER_EXCEPTIONS[0];
  await page.getByLabel(`Explanation: ${first}`).fill("ok");
  await page.getByRole("button", { name: `Resolve: ${first}` }).click();
  await expect(page.getByText("Write a short explanation (at least 10 characters).")).toBeVisible();

  for (const what of SEPTEMBER_EXCEPTIONS) {
    await page.getByLabel(`Explanation: ${what}`).fill("Checked with accounts payable; corrected in October.");
    await page.getByRole("button", { name: `Resolve: ${what}` }).click();
    await expect(page.getByLabel(`Explanation: ${what}`)).toHaveCount(0);
  }
  // Exact: "Exception explained" toasts and the subtitle contain the word too.
  await expect(page.getByText("Explained", { exact: true })).toHaveCount(4);
  await expect(page.getByText(/Sofía Garza ·/)).toHaveCount(4);

  await page.getByRole("button", { name: "Close September" }).click();
  await expect(page.getByText("Close September? Its expenses will be locked.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("September closed. Its expenses are locked.")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: /^September/ })).toContainText("Closed");
  await expect(page.getByText(/^Closed by Sofía Garza on /)).toBeVisible();
});

test("executive: reads month close but can't resolve or close", async ({ page }) => {
  await loginAs(page, "Executive");
  await page.goto("/close");
  await expect(page.getByText("Only finance resolves exceptions and closes months.")).toBeVisible();
  await expect(page.getByText("Waiting for finance to explain it.")).toHaveCount(4);
  await expect(page.getByRole("button", { name: /^Resolve/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Close / })).toHaveCount(0);
});

test("champion: month close is not theirs, and a closed month's expenses are locked", async ({ page }) => {
  await loginAs(page, "Champion · Facilities");
  await expect(page.getByRole("link", { name: "Month close" })).toHaveCount(0);
  expect((await page.goto("/close"))?.status()).toBe(404);

  // August is closed: an August expense opens read-only, without a Save button.
  await page.goto("/expenses?month=8");
  await page.getByLabel(/^Edit: /).first().click(); // a Link rendered through Button, so its role is "button"
  const sheet = page.getByRole("dialog", { name: "Edit expense" });
  await expect(sheet.getByText("This expense is in a closed month and can’t be edited.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save expense" })).toHaveCount(0);

  // The form won't offer a closed month, and the server refuses one even if the form is tampered with.
  await page.goto("/expenses?new=1");
  const form = page.getByRole("dialog", { name: "New expense" });
  const month = form.getByLabel("Fiscal month");
  await expect(month.locator("option", { hasText: "August" })).toBeDisabled();
  await month.evaluate((select: HTMLSelectElement) => {
    for (const option of select.options) option.disabled = false;
  });
  await form.getByLabel("Description").fill("Back-dated invoice");
  await form.getByLabel("Vendor").fill("LimpiaMax Servicios");
  await form.getByLabel("Line item").selectOption({ index: 1 });
  await month.selectOption("8");
  await form.getByLabel("Amount").fill("100");
  await form.getByRole("button", { name: "Save expense" }).click();
  await expect(page.getByText("That month is closed: its expenses can’t be added to or edited.")).toBeVisible();
});
