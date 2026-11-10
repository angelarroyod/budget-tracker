import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Locally the secrets live in .env (Next reads it too); CI sets them in the workflow.
if (existsSync(".env")) process.loadEnvFile(".env");

const PORT = 3100; // not 3000, so a running `pnpm dev` is never mistaken for the test server

export default defineConfig({
  testDir: "e2e",
  // ponytail: one worker. Every spec shares one seeded database and resets it; per-worker
  // databases would allow parallelism if the suite ever gets slow.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Production build, as the Next.js testing guide recommends: same code path as Vercel.
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
