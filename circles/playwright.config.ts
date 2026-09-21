import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, serverEnvironment } from "./e2e/support/env";

const isCI = !!process.env.CI;

/**
 * Cross-browser runs cost time that rarely pays off for this suite, so Chromium is the default and the
 * others are opt-in: `E2E_ALL_BROWSERS=true bun run e2e`, or `bun run e2e --project=firefox`.
 */
const browsers = [
    { name: "chromium", device: devices["Desktop Chrome"] },
    ...(process.env.E2E_ALL_BROWSERS === "true"
        ? [
              { name: "firefox", device: devices["Desktop Firefox"] },
              { name: "webkit", device: devices["Desktop Safari"] },
          ]
        : []),
];

export default defineConfig({
    testDir: "./e2e",
    // Playwright specs are *.spec.ts; *.test.ts belongs to the bun unit and component suites.
    testMatch: /.*\.(spec|setup)\.ts$/,

    // Traces, screenshots and videos of failed tests. Cleared at the start of every run.
    outputDir: "./e2e/.results",

    fullyParallel: true,
    timeout: 60_000,
    expect: { timeout: 10_000 },

    // A `test.only` left in a branch would quietly skip the rest of the suite in CI.
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 4 : undefined,

    reporter: [
        [isCI ? "dot" : "list"],
        ["html", { outputFolder: "./e2e/.report", open: "never" }],
        // Annotates the failing lines directly in the GitHub pull request diff.
        ...(isCI ? ([["github"], ["junit", { outputFile: "./e2e/.results/junit.xml" }]] as const) : []),
    ],

    use: {
        baseURL: BASE_URL,

        // Everything needed to diagnose a failure without reproducing it locally. All three are kept
        // only for failures, so a green run leaves nothing behind.
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",

        actionTimeout: 15_000,
        navigationTimeout: 30_000,
    },

    globalSetup: "./e2e/global-setup.ts",
    globalTeardown: "./e2e/global-teardown.ts",

    projects: [
        // Creates the run's shared accounts and their stored sessions. Everything else waits for it.
        { name: "setup", testMatch: /auth\.setup\.ts$/ },

        ...browsers.map(({ name, device }) => ({
            name,
            use: { ...device },
            dependencies: ["setup"],
            testMatch: /tests\/.*\.spec\.ts$/,
        })),
    ],

    webServer: {
        // Locally this is the dev server, which is what makes an edit-and-rerun loop bearable. CI sets
        // E2E_WEB_SERVER_COMMAND to `next start`, so it tests the same production build it ships.
        command: process.env.E2E_WEB_SERVER_COMMAND ?? "bun run e2e:server",
        url: `${BASE_URL}/api/version`,
        reuseExistingServer: !isCI,
        // A cold Next.js dev server has to compile the first route it is asked for.
        timeout: 240_000,
        env: serverEnvironment(),
        stdout: "ignore",
        stderr: "pipe",
    },
});
