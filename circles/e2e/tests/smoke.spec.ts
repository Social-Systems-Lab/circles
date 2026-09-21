/**
 * The pages a signed-out visitor can reach.
 *
 * These are deliberately shallow: they prove the server renders, routes resolve and the database is
 * reachable. When something is badly broken, this is the file that says so first.
 */

import { expect, test } from "../support/fixtures";

test.describe("public pages", () => {
    test("the landing page introduces the platform and offers a way in", async ({ page }) => {
        await page.goto("/");

        await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
        await expect(page.getByRole("link", { name: /Find the others/ })).toBeVisible();
    });

    test("the explore page loads", async ({ page }) => {
        const response = await page.goto("/explore");

        expect(response?.status()).toBeLessThan(400);
    });

    test("the login page shows the sign-in form", async ({ page }) => {
        await page.goto("/login");

        await expect(page.getByLabel("Email")).toBeVisible();
        await expect(page.getByLabel("Password")).toBeVisible();
    });

    test("a circle that does not exist does not render as a circle", async ({ page }) => {
        await page.goto("/circles/e2e-definitely-not-a-real-circle");

        await expect(page).not.toHaveURL(/\/circles\/e2e-definitely-not-a-real-circle$/);
    });
});
