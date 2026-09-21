/**
 * How the application treats a session cookie.
 *
 * The tests hand the browser a token minted the same way the application mints one (see
 * support/session.ts), so what is exercised here is the real verification path: the middleware, the
 * access API and the server components all read the cookie exactly as they would for a real visitor.
 */

import { expect, test } from "../support/fixtures";
import { BASE_URL } from "../support/env";
import { SESSION_COOKIE_NAME } from "../support/session";
import { readSharedUser, storageStatePath } from "../support/shared-users";

test.describe("a signed-out visitor", () => {
    test("is offered a way to log in", async ({ page }) => {
        await page.goto("/");

        await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    });

    test("cannot reach another user's settings", async ({ page, seed }) => {
        const other = await seed.user();

        await page.goto(`/circles/${other.handle}/settings`);

        await expect(page).not.toHaveURL(new RegExp(`/circles/${other.handle}/settings$`));
    });
});

test.describe("a signed-in user", () => {
    test.use({ storageState: storageStatePath("member") });

    test("can open their own profile", async ({ page }) => {
        const member = readSharedUser("member");

        await page.goto(`/circles/${member.handle}`);

        // The circle route redirects to whichever module the circle opens on.
        await expect(page).toHaveURL(new RegExp(`/circles/${member.handle}/`));
        await expect(page.getByText(member.name).first()).toBeVisible();
    });

    test("keeps the session across navigations", async ({ page, context }) => {
        const member = readSharedUser("member");

        await page.goto(`/circles/${member.handle}`);
        await page.goto("/explore");

        const cookies = await context.cookies();
        expect(cookies.map((cookie) => cookie.name)).toContain(SESSION_COOKIE_NAME);
    });
});

test.describe("a session that does not verify", () => {
    test("is discarded rather than trusted", async ({ page, context }) => {
        // A token the server cannot verify — what a visitor is left holding after the JWT secret is
        // rotated. The middleware clears it instead of failing the request.
        await context.addCookies([{ name: SESSION_COOKIE_NAME, value: "not.a.valid.token", url: BASE_URL }]);

        await page.goto("/");

        const sessionCookie = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE_NAME);
        expect(sessionCookie?.value ?? "").toBe("");
        await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    });
});
