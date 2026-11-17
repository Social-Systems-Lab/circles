// Run with Bun and the same optional Playwright tooling as the existing browser checks.
// Real React components; mocked server actions/router; loopback requests only. No app server or database.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const appDir = fileURLToPath(new URL("../", import.meta.url));
const entry = `
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Shell from ${JSON.stringify(`${appDir}src/components/onboarding/resumable-onboarding-shell.tsx`)};
import { ONBOARDING_CARDS } from "@/lib/onboarding/resumable-state";
const root = createRoot(document.getElementById("root"));
let key = 0;
const pending = [];
const pendingOperations = [];
const pendingRoutes = [];
window.photoTest = {
    uploads: [], navigations: [], finishes: 0, refreshes: 0, revoked: [],
    operations: [], delayOperations: false,
    operation(kind, card) {
        this.operations.push(kind);
        const result = kind === "finish" ? {success:true, redirectTo:"/profile"} : {success:true, card};
        return this.delayOperations
            ? new Promise(resolve => pendingOperations.push({resolve, result}))
            : Promise.resolve(result);
    },
    settleOperation(result) {
        const operation = pendingOperations.shift();
        operation.resolve(result || operation.result);
    },
    delayRoute: false,
    push(url) {
        this.navigations.push(url);
        if (this.delayRoute) return new Promise(resolve => pendingRoutes.push(resolve));
    },
    settleRoute() { pendingRoutes.shift()(); },
    upload(id, form) {
        this.uploads.push({ id, name: form.get("picture").name });
        return new Promise((resolve, reject) => pending.push({ resolve, reject }));
    },
    settle(result) { pending.shift().resolve(result); },
    reject() { pending.shift().reject(new Error("synthetic upload failure")); },
    mount(options = {}) {
        root.render(<StrictMode><Shell key={++key} currentCard="profile-photo"
            statuses={ONBOARDING_CARDS.map(card => ({ ...card,
                complete: card.kind === "participation" || (card.id === "profile-photo" && Boolean(options.pictureUrl)) }))}
            skippedCards={[]} completionAcknowledged={false} previousCard="location" navigationSaveFailed={false}
            profile={{ circleId: "0123456789abcdef01234567", ...options }}
            humanVerification={{ realPersonCount: 0, metInRealLifeCount: 0 }} /></StrictMode>);
    },
    unmount() { root.render(<div>Unmounted</div>); }
};
const revoke = URL.revokeObjectURL.bind(URL);
URL.revokeObjectURL = url => { window.photoTest.revoked.push(url); revoke(url); };
window.photoTest.mount();
`;
const mocks = {
    "next/dynamic": "export default () => () => null;",
    "next/image": "export default props => <img {...props} />;",
    "next/link": "export default props => <a {...props} />;",
    "next/font/google": 'export const Montserrat = () => ({variable:""}); export const Noto_Serif = Montserrat;',
    "next/navigation": `export const useRouter = () => ({
        push: url => window.photoTest.push(url),
        refresh: () => window.photoTest.refreshes++
    });`,
    "@/components/modules/home/actions": `export const updateCircleField = (id, form) => window.photoTest.upload(id, form);`,
    "@/app/onboarding/card-actions": `export const acceptOnboardingCommunityGuidelinesAction = async () => ({success:true});
        export const saveOnboardingIntroductionAction = acceptOnboardingCommunityGuidelinesAction;
        export const saveOnboardingLocationAction = acceptOnboardingCommunityGuidelinesAction;`,
    "@/app/onboarding/actions": `
        export const acknowledgeOnboardingCompletion = async () => {
            window.photoTest.finishes++; return window.photoTest.operation("finish");
        };
        export const navigateOnboardingCard = card => window.photoTest.operation("navigate", card);
        export const skipOnboardingCard = card => window.photoTest.operation("skip", card);`,
};
const bundle = await Bun.build({
    entrypoints: ["photo-test-entry"],
    target: "browser",
    plugins: [
        {
            name: "isolated-onboarding-ui",
            setup(build) {
                build.onResolve({ filter: /^photo-test-entry$/ }, () => ({ path: "entry", namespace: "photo-test" }));
                build.onLoad({ filter: /.*/, namespace: "photo-test" }, () => ({
                    contents: entry,
                    loader: "tsx",
                    resolveDir: appDir,
                }));
                build.onResolve(
                    { filter: /^(next\/|@\/app\/onboarding\/|@\/components\/modules\/home\/actions)/ },
                    (args) => (args.path in mocks ? { path: args.path, namespace: "photo-mock" } : undefined),
                );
                build.onLoad({ filter: /.*/, namespace: "photo-mock" }, (args) => ({
                    contents: mocks[args.path],
                    loader: "tsx",
                    resolveDir: appDir,
                }));
                build.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: "export default {};", loader: "js" }));
            },
        },
    ],
});
assert.equal(bundle.success, true, bundle.logs.map(String).join("\n"));
const javascript = await bundle.outputs[0].text();
const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pV8AAAAASUVORK5CYII=",
    "base64",
);
const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/bundle.js") return new Response(javascript, { headers: { "Content-Type": "text/javascript" } });
        if (path !== "/") return new Response(png, { headers: { "Content-Type": "image/png" } });
        return new Response('<div id="root"></div><script type="module" src="/bundle.js"></script>', {
            headers: { "Content-Type": "text/html" },
        });
    },
});
const origin = `http://127.0.0.1:${server.port}`;
const localChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(localChrome) ? localChrome : undefined);
let browser;
try {
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
    page.setDefaultTimeout(10000);
    const errors = [];
    const externalRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        externalRequests.push(route.request().url());
        return route.abort();
    });
    const finish = page.getByRole("button", { name: "Finish onboarding", exact: true });
    const retry = page.getByRole("button", { name: "Retry upload", exact: true });
    const input = page.getByLabel("Choose an image file", { exact: true });
    const preview = page.locator('section[aria-label="Add a profile picture"] img');
    const status = page.locator("#onboarding-profile-photo-status");
    const saved = { success: true, circle: { picture: { url: "/storage/test/saved.png" } } };
    const reset = async (options) => {
        await page.goto(origin);
        await input.waitFor();
        if (options) {
            await page.evaluate((options) => window.photoTest.mount(options), options);
            await input.waitFor();
        }
    };
    const select = async (name = "photo.png") => input.setInputFiles({ name, mimeType: "image/png", buffer: png });
    const settle = async (result) => {
        await page.evaluate((result) => window.photoTest.settle(result), result);
        await page.waitForFunction(() =>
            document.querySelector('[aria-label="Add a profile picture"] [aria-busy="false"]'),
        );
    };
    const count = () => page.evaluate(() => window.photoTest.uploads.length);
    const confirmFinish = async (accept) => {
        let prompted = false;
        page.once("dialog", async (dialog) => {
            prompted = true;
            assert.match(dialog.message(), /not been saved.*without saving/);
            await (accept ? dialog.accept() : dialog.dismiss());
        });
        await finish.click();
        assert.equal(prompted, true);
    };

    await reset();
    assert.equal(await status.count(), 1, "the live region exists before any upload");
    assert.equal(await status.getAttribute("role"), "status");
    assert.equal(await status.getAttribute("aria-live"), "polite");
    assert.equal(await status.getAttribute("aria-atomic"), "true");
    await page.evaluate(() => {
        window.photoTest.statusNode = document.getElementById("onboarding-profile-photo-status");
    });
    // Dispatch twice in one task, before React can disable the picker: the ref must stop request two.
    await page.evaluate(() => {
        const input = document.querySelector('input[type="file"]');
        const files = new DataTransfer();
        files.items.add(new File(["synthetic"], "photo.png", { type: "image/png" }));
        input.files = files.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.getByRole("status").filter({ hasText: "Uploading your picture" }).waitFor();
    assert.equal(await status.evaluate((node) => node === window.photoTest.statusNode), true);
    assert.equal(await status.evaluate((node) => node.closest('[aria-busy="true"]') === null), true);
    assert.equal(await page.locator('[aria-label="Add a profile picture"] [aria-busy="true"]').count(), 1);
    assert.equal(await count(), 1);
    assert.match(await preview.getAttribute("src"), /^blob:/);
    assert.equal(await input.isDisabled(), true);
    for (const name of ["Back", "Skip for now", "Exit onboarding and go to Explore", "Finish onboarding"]) {
        assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true, name);
    }
    await page.getByText("View progress", { exact: true }).click();
    await page.getByRole("link", { name: /Introduce yourself/ }).click();
    assert.equal(await page.evaluate(() => window.photoTest.navigations.length), 0);
    await settle(saved);
    await page.getByRole("status").filter({ hasText: "Your profile picture is saved" }).waitFor();
    assert.equal(await status.evaluate((node) => node === window.photoTest.statusNode), true);
    assert.equal(await input.getAttribute("aria-invalid"), "false");
    assert.equal(await preview.getAttribute("src"), saved.circle.picture.url);
    assert.equal(await input.inputValue(), "");
    assert.equal(await page.evaluate(() => window.photoTest.refreshes), 1);
    assert.equal(await page.evaluate(() => window.photoTest.revoked.length), 1);
    assert.equal(await retry.count(), 0);
    await finish.click();
    await page.waitForFunction(() => window.photoTest.finishes === 1);

    // A successful response without a persisted URL (or with the placeholder) is not upload success.
    for (const result of [
        { success: true },
        { success: true, circle: { picture: { url: "/images/default-user-picture.png" } } },
    ]) {
        await reset();
        await select();
        await settle(result);
        await retry.waitFor();
        assert.match(await preview.getAttribute("src"), /^blob:/);
        assert.equal(await page.evaluate(() => window.photoTest.refreshes), 0);
        await confirmFinish(false);
        assert.equal(await page.evaluate(() => window.photoTest.finishes), 0);
        await confirmFinish(true);
        await page.waitForFunction(() => window.photoTest.finishes === 1);
        assert.equal(await count(), 1, "Finish never starts a second upload");
    }

    await reset();
    await page.evaluate(() => {
        window.photoTest.statusNode = document.getElementById("onboarding-profile-photo-status");
    });
    await select();
    const failedPreview = await preview.getAttribute("src");
    await settle({ success: false, message: "Synthetic storage failure" });
    await status.filter({ hasText: "Synthetic storage failure" }).waitFor();
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.match(await input.getAttribute("aria-describedby"), /onboarding-profile-photo-status/);
    assert.equal(await retry.getAttribute("aria-describedby"), "onboarding-profile-photo-status");
    assert.equal(await status.evaluate((node) => node.closest('[aria-busy="true"]') === null), true);
    assert.equal(await status.evaluate((node) => node === window.photoTest.statusNode), true);
    await page.evaluate(() => {
        const button = [...document.querySelectorAll("button")].find((button) =>
            button.textContent.includes("Retry upload"),
        );
        button.click();
        button.click();
    });
    assert.equal(await count(), 2, "double retry starts exactly one additional request");
    await page.evaluate(() => window.photoTest.reject());
    await retry.waitFor();
    assert.equal(await preview.getAttribute("src"), failedPreview);
    await input.focus();
    await page.keyboard.press("Tab");
    assert.equal(await retry.evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press("Enter");
    await settle(saved);
    assert.equal(await count(), 3);
    assert.deepEqual(await page.evaluate(() => window.photoTest.uploads.map((upload) => upload.name)), [
        "photo.png",
        "photo.png",
        "photo.png",
    ]);

    for (const name of ["Back", "Skip for now", "Exit onboarding and go to Explore"]) {
        await reset();
        await select();
        await settle({ success: false });
        const button = page.getByRole("button", { name, exact: true });
        page.once("dialog", (dialog) => dialog.dismiss());
        await button.click();
        assert.equal(await page.evaluate(() => window.photoTest.navigations.length), 0);
        page.once("dialog", (dialog) => dialog.accept());
        await button.click();
        await page.waitForFunction(() => window.photoTest.navigations.length === 1);
        assert.equal(await count(), 1, "navigation does not retry the upload");
    }

    // Navigation locks uploads before pending is rendered, and throughout a delayed server action.
    for (const name of ["Finish onboarding", "Back", "Skip for now", "progress link"]) {
        await reset();
        await select();
        await settle({ success: false, message: "Keep this selection for retry" });
        const failedPreview = await preview.getAttribute("src");
        await page.getByText("View progress", { exact: true }).click();
        await page.evaluate(() => {
            window.photoTest.delayOperations = true;
        });
        page.once("dialog", (dialog) => dialog.accept());
        await page.evaluate((name) => {
            const button = [...document.querySelectorAll("button")].find((button) => button.textContent === name);
            const link = [...document.querySelectorAll("a")].find((link) =>
                link.textContent.includes("Introduce yourself"),
            );
            const retry = [...document.querySelectorAll("button")].find((button) =>
                button.textContent.includes("Retry upload"),
            );
            (name === "progress link" ? link : button).click();
            // These events arrive in the same task as navigation, before disabled props can protect us.
            const input = document.querySelector('input[type="file"]');
            const files = new DataTransfer();
            files.items.add(new File(["synthetic"], "blocked.png", { type: "image/png" }));
            input.files = files.files;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            retry.click();
        }, name);
        await page.waitForFunction(() => window.photoTest.operations.length === 1);
        assert.equal(await input.isDisabled(), true, name);
        assert.equal(await retry.isDisabled(), true, name);
        for (const name of ["Back", "Skip for now", "Exit onboarding and go to Explore"]) {
            assert.equal(await page.getByRole("button", { name, exact: true }).isDisabled(), true);
        }
        assert.equal(await count(), 1, "navigation must not start or retry an upload");
        assert.equal(await preview.getAttribute("src"), failedPreview, "blocked selection leaves the preview intact");
        // Delayed navigation also blocks further step links and forced file-change events.
        await page.getByRole("link", { name: /Introduce yourself/ }).click();
        await select("also-blocked.png");
        assert.equal(await count(), 1);
        assert.equal(await page.evaluate(() => window.photoTest.operations.length), 1);
        assert.equal(await page.evaluate(() => window.photoTest.navigations.length), 0);
        await page.evaluate(() => window.photoTest.settleOperation());
        await page.waitForFunction(() => window.photoTest.navigations.length === 1);
        assert.equal(await count(), 1, "only the previously failed upload exists when navigation completes");
    }

    // Exit has no server action; its route transition still needs the same upload lock.
    await reset();
    await select();
    await settle({ success: false });
    await page.evaluate(() => {
        window.photoTest.delayRoute = true;
    });
    page.once("dialog", (dialog) => dialog.accept());
    await page.evaluate(() => {
        document.querySelector('[aria-label="Exit onboarding and go to Explore"]').click();
        const input = document.querySelector('input[type="file"]');
        input.dispatchEvent(new Event("change", { bubbles: true }));
        [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Retry upload")).click();
    });
    assert.equal(await input.isDisabled(), true);
    assert.equal(await retry.isDisabled(), true);
    assert.equal(await count(), 1, "Exit cannot start a new upload");
    assert.deepEqual(await page.evaluate(() => window.photoTest.navigations), ["/explore"]);
    await page.evaluate(() => window.photoTest.settleRoute());

    // The original reproduction: Finish with no file, then try selecting during slow completion.
    await reset();
    await page.evaluate(() => {
        window.photoTest.delayOperations = true;
    });
    await finish.click();
    assert.equal(await input.isDisabled(), true);
    await select("too-late.png");
    assert.equal(await count(), 0);
    await page.evaluate(() =>
        window.photoTest.settleOperation({ success: false, message: "Synthetic completion failure" }),
    );
    await page.getByRole("alert").filter({ hasText: "Synthetic completion failure" }).waitFor();
    assert.equal(await input.isDisabled(), false, "failed completion unlocks selection");
    await select();
    await settle({ success: false, message: "Synthetic upload failure after completion failure" });
    await status.filter({ hasText: "Synthetic upload failure after completion failure" }).waitFor();
    await input.focus();
    await page.keyboard.press("Tab");
    assert.equal(await retry.evaluate((button) => button === document.activeElement), true);
    await page.keyboard.press("Space");
    await settle(saved);
    assert.equal(await count(), 2, "retry remains available after failed completion");
    assert.equal(await page.evaluate(() => window.photoTest.navigations.length), 0);

    // Upload-first protection must also work before React has disabled navigation controls.
    await reset();
    await page.getByText("View progress", { exact: true }).click();
    await page.evaluate(() => {
        const input = document.querySelector('input[type="file"]');
        const files = new DataTransfer();
        files.items.add(new File(["synthetic"], "upload-first.png", { type: "image/png" }));
        input.files = files.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        for (const button of document.querySelectorAll("button")) {
            if (["Back", "Skip for now", "Exit onboarding", "Finish onboarding"].includes(button.textContent))
                button.click();
        }
        [...document.querySelectorAll("a")].find((link) => link.textContent.includes("Introduce yourself")).click();
    });
    assert.equal(await count(), 1);
    assert.deepEqual(await page.evaluate(() => window.photoTest.operations), []);
    assert.deepEqual(await page.evaluate(() => window.photoTest.navigations), []);
    await settle({ success: false, message: "Upload-first failure remains visible" });
    await status.filter({ hasText: "Upload-first failure remains visible" }).waitFor();
    await retry.waitFor();

    // Failed selection can be replaced; the discarded preview is revoked, and the new file is uploaded.
    await reset({ pictureUrl: "/storage/test/old.png" });
    await select("first.png");
    const firstPreview = await preview.getAttribute("src");
    await settle({ success: false });
    await select("replacement.png");
    assert.equal(await page.evaluate((url) => window.photoTest.revoked.includes(url), firstPreview), true);
    await settle(saved);
    await select("replacement.png"); // successful upload resets the native input, allowing the same file again
    assert.equal(await count(), 3);
    await settle(saved);

    // Unmount frees the pending preview; a late response must not refresh the destination page.
    await reset();
    await select();
    const pendingPreview = await preview.getAttribute("src");
    await page.evaluate(() => window.photoTest.unmount());
    await page.getByText("Unmounted", { exact: true }).waitFor();
    assert.equal(await page.evaluate((url) => window.photoTest.revoked.includes(url), pendingPreview), true);
    await page.evaluate((result) => window.photoTest.settle(result), saved);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
    assert.equal(await page.evaluate(() => window.photoTest.refreshes), 0);

    // Photo remains optional; finishing without choosing a file needs no discard prompt or upload.
    for (const options of [undefined, { pictureUrl: "/storage/test/existing.png" }]) {
        await reset(options);
        if (options) assert.equal(await preview.getAttribute("src"), options.pictureUrl);
        await finish.click();
        await page.waitForFunction(() => window.photoTest.finishes === 1);
        assert.equal(await count(), 0);
    }

    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, []);
    console.log(
        "Onboarding photo browser checks passed: auto-upload, duplicates, delayed navigation/completion, live status, keyboard retry, failure, replacement and cleanup.",
    );
} finally {
    await browser?.close();
    server.stop(true);
}
