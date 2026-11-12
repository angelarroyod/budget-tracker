import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs, resetData, type Role } from "./helpers";

// The README's Lighthouse claim as a regression gate: the main screens, in both locales and
// both themes, must have zero axe violations against WCAG 2.2 A/AA.

const SCREENS: { name: string; role: Role | null; open: (page: Page) => Promise<unknown> }[] = [
  { name: "login", role: null, open: (page) => page.goto("/login") },
  { name: "executive dashboard", role: "Executive", open: (page) => page.goto("/") },
  { name: "team dashboard", role: "Champion · Facilities", open: (page) => page.reload() }, // champions land on their team
  { name: "expenses", role: "Executive", open: (page) => page.goto("/expenses") },
  {
    name: "expense form",
    role: "Champion · Facilities",
    open: async (page) => {
      await page.goto("/expenses?new=1");
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  { name: "approvals", role: "Executive", open: (page) => page.goto("/approvals") },
  {
    name: "approval detail",
    role: "Executive",
    open: async (page) => {
      await page.goto("/approvals");
      await page.getByRole("table").getByRole("link").first().click();
      await expect(page).toHaveURL(/\/approvals\/\d+$/);
    },
  },
  { name: "month close", role: "Finance", open: (page) => page.goto("/close") },
];

test.beforeAll(async ({ request }) => resetData(request));

for (const locale of ["en-US", "es-MX"] as const) {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`${locale} · ${colorScheme}`, () => {
      test.use({ colorScheme });

      for (const screen of SCREENS) {
        test(screen.name, async ({ page, context, baseURL }) => {
          // Log in first (the role buttons are matched in English), then switch the locale.
          if (screen.role) await loginAs(page, screen.role);
          await context.addCookies([{ name: "locale", value: locale, url: baseURL! }]);
          await screen.open(page);

          await expect(page.locator("html")).toHaveAttribute("lang", locale);
          if (colorScheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
          // Let entry animations (sheet slide-in, chart fades) finish so contrast is measured at rest.
          await page.evaluate(() =>
            Promise.all(
              document.getAnimations()
                .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
                .map((a) => a.finished.catch(() => {})),
            ),
          );

          const { violations } = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
            .analyze();
          const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
          expect(summary).toEqual([]);
        });
      }
    });
  }
}
