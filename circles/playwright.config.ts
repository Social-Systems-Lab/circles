import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const healthURL = process.env.PLAYWRIGHT_HEALTH_URL || `${baseURL}/api/version`;

export default defineConfig({
    testDir: "./tests/playwright",
    testMatch: "**/*.pw.ts",
    timeout: 30_000,
    expect: {
        timeout: 5_000,
    },
    fullyParallel: true,
    reporter: [["list"], ["html", { outputFolder: "reports/playwright-html", open: "never" }]],
    use: {
        baseURL,
        trace: "retain-on-failure",
    },
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
              command: "bun run dev",
              url: healthURL,
              reuseExistingServer: true,
              timeout: 240_000,
          },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
});
