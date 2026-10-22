import { defineConfig, devices } from "@playwright/test"

// E2E against the real Worker + Durable Objects (`alchemy dev`), or any deployed URL via BASE_URL.
// Files are *.e2e.ts so `bun test` (unit tests) never picks them up.
const baseURL = process.env.BASE_URL ?? "http://localhost:8787"

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    video: { mode: "on", size: { width: 1280, height: 800 } },
    screenshot: "on",
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"]
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: "home.e2e.ts" }
  ],
  webServer: process.env.BASE_URL ? [] : {
    command: "bun run build && bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000
  }
})
