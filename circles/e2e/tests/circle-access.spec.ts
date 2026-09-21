/**
 * Who can see a circle.
 *
 * Each test seeds the exact circle and membership it needs, so there is no dependency on the order
 * tests run in or on data left over from an earlier run. The `seed` fixture removes it all afterwards.
 */

import { expect, test } from "../support/fixtures";

test.describe("a public circle", () => {
    test("is readable without signing in", async ({ page, seed }) => {
        const circle = await seed.circle({ name: "Open Circle" });

        await page.goto(`/circles/${circle.handle}`);

        await expect(page).toHaveURL(new RegExp(`/circles/${circle.handle}/`));
        await expect(page.getByText(circle.name).first()).toBeVisible();
    });
});

test.describe("a secret circle", () => {
    test("does not exist as far as a signed-out visitor is concerned", async ({ page, seed }) => {
        const circle = await seed.circle({ visibility: "secret" });

        await page.goto(`/circles/${circle.handle}`);

        await expect(page).toHaveURL(/not-found/);
    });

    test("does not exist for a signed-in non-member either", async ({ page, seed, signInAs }) => {
        const circle = await seed.circle({ visibility: "secret" });
        const outsider = await seed.user();
        await signInAs(outsider);

        await page.goto(`/circles/${circle.handle}`);

        await expect(page).toHaveURL(/not-found/);
    });

    test("is readable by its members", async ({ page, seed, signInAs }) => {
        const member = await seed.user();
        const circle = await seed.circleOwnedBy(member, { visibility: "secret", name: "Members Only" });
        await signInAs(member);

        await page.goto(`/circles/${circle.handle}`);

        await expect(page).toHaveURL(new RegExp(`/circles/${circle.handle}/`));
        await expect(page.getByText(circle.name).first()).toBeVisible();
    });
});

test.describe("a paused circle", () => {
    test("is not readable", async ({ page, seed }) => {
        const circle = await seed.circle({ moderationStatus: "unavailable" });

        await page.goto(`/circles/${circle.handle}`);

        await expect(page).toHaveURL(/not-found/);
    });
});
